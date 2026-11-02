"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { ConfirmDialog, EmptyNote, ErrorNote, Icon, PageTitle, RangePicker, Stat } from "@/components/ui";
import { browserTimeZone, dateTime, daysUntil, frequencyLabels, localDay, money, rangeBounds, shortDay, type DateRange } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import type { Analytics, ExpensePreset, ExpenseRow } from "@/lib/types";

const LIST_LIMIT = 200;

export default function ExpensesPage() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";

  const [range, setRange] = useState<DateRange>({ preset: "today", from: "", to: "" });
  const [presets, setPresets] = useState<ExpensePreset[]>([]);
  const [today] = useState(() => localDay());
  const [paying, setPaying] = useState<ExpensePreset | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payBusy, setPayBusy] = useState(false);
  const [payError, setPayError] = useState("");
  const [rows, setRows] = useState<ExpenseRow[] | null>(null);
  const [count, setCount] = useState(0);
  const [summary, setSummary] = useState<Analytics | null>(null);
  const [version, setVersion] = useState(0);
  const [loadError, setLoadError] = useState("");

  const [presetId, setPresetId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");

  const [deleting, setDeleting] = useState<ExpenseRow | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  useEffect(() => {
    let active = true;
    supabase
      .from("expense_presets")
      .select("id, name, default_amount, frequency, next_due_on")
      .order("name")
      .then(({ data }) => {
        if (active) setPresets((data as ExpensePreset[]) ?? []);
      });
    return () => {
      active = false;
    };
  }, [version]);

  const incompleteCustom = range.preset === "custom" && (!range.from || !range.to);

  useEffect(() => {
    if (incompleteCustom) return;
    let active = true;
    const { from, to } = rangeBounds(range);
    Promise.all([
      supabase
        .from("expenses")
        .select("id, name, amount, note, due_on, created_at, staff:profiles(username)", { count: "exact" })
        .gte("created_at", from)
        .lt("created_at", to)
        .order("created_at", { ascending: false })
        .limit(LIST_LIMIT),
      supabase.rpc("analytics", { p_from: from, p_to: to, p_tz: browserTimeZone() }),
    ]).then(([list, totals]) => {
      if (!active) return;
      if (list.error) {
        setLoadError(list.error.message);
        return;
      }
      setLoadError("");
      setRows(list.data as unknown as ExpenseRow[]);
      setCount(list.count ?? 0);
      if (totals.data) setSummary(totals.data as Analytics);
    });
    return () => {
      active = false;
    };
  }, [range, incompleteCustom, version]);

  const bills = presets
    .filter((preset) => preset.frequency && preset.next_due_on)
    .sort((a, b) => (a.next_due_on as string).localeCompare(b.next_due_on as string));
  // Recurring bills are paid from their own list, so their due dates stay correct.
  const quickPresets = presets.filter((preset) => !preset.frequency);

  async function payBill(event: React.FormEvent) {
    event.preventDefault();
    if (!paying) return;
    const value = Number(payAmount);
    if (!Number.isFinite(value) || value <= 0) return setPayError("Enter an amount greater than zero.");

    setPayBusy(true);
    setPayError("");
    const { data, error } = await supabase.rpc("pay_recurring_bill", {
      p_preset_id: paying.id,
      p_due_on: paying.next_due_on,
      p_amount: value,
    });
    setPayBusy(false);
    if (error) return setPayError(error.message);

    setNotice(`Paid ${money(value)} for ${paying.name}. Next due ${shortDay(data as string)}.`);
    setPaying(null);
    setVersion((v) => v + 1);
  }

  function applyPreset(preset: ExpensePreset) {
    setPresetId(preset.id);
    setName(preset.name);
    setAmount(String(preset.default_amount));
    setFormError("");
    setNotice("");
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    const value = Number(amount);
    if (!name.trim()) return setFormError("Enter what this expense is for.");
    if (!Number.isFinite(value) || value <= 0) return setFormError("Enter an amount greater than zero.");

    setBusy(true);
    setFormError("");
    const { error } = await supabase.from("expenses").insert({
      preset_id: presetId,
      name: name.trim(),
      amount: value,
      note: note.trim() || null,
    });
    setBusy(false);
    if (error) return setFormError(error.message);

    setNotice(`Saved ${money(value)} for ${name.trim()}.`);
    setPresetId(null);
    setName("");
    setAmount("");
    setNote("");
    setVersion((v) => v + 1);
  }

  async function confirmDelete() {
    if (!deleting) return;
    setDeleteBusy(true);
    setDeleteError("");
    const { data, error } = await supabase.from("expenses").delete().eq("id", deleting.id).select("id");
    setDeleteBusy(false);
    if (error) return setDeleteError(error.message);
    if (!data?.length) return setDeleteError("This expense could not be deleted.");
    setDeleting(null);
    setVersion((v) => v + 1);
  }

  return (
    <div>
      <PageTitle subtitle="Record what the business spends.">Expenses</PageTitle>

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_370px] lg:items-start lg:gap-6">
        <div className="min-w-0 lg:order-2">
          <form onSubmit={save} className="card space-y-3 p-4 lg:sticky lg:top-7">
            <h2 className="flex items-center gap-2 text-base font-bold"><Icon name="expenses" size={18} />Record an expense</h2>
            {quickPresets.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {quickPresets.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    aria-pressed={presetId === preset.id}
                    onClick={() => applyPreset(preset)}
                    className="chip !min-h-11 !py-1 !pl-4"
                  >
                    <span>
                      <span className="block text-sm leading-tight">{preset.name}</span>
                      <span className={`money block text-xs font-semibold leading-tight ${presetId === preset.id ? "text-mint" : "text-brand"}`}>
                        {money(preset.default_amount)}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            )}
            <div className="grid grid-cols-[minmax(0,1fr)_120px] gap-2">
              <div>
                <label className="label" htmlFor="expense-name">Expense</label>
                <input
                  id="expense-name"
                  className="field"
                  placeholder="e.g. Paper stock"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="off"
                />
              </div>
              <div>
                <label className="label" htmlFor="expense-amount">Amount</label>
                <input
                  id="expense-amount"
                  className="field money"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="any"
                  placeholder="0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>
            </div>
            <div>
              <label className="label" htmlFor="expense-note">
                Note <span className="font-normal text-muted">(optional)</span>
              </label>
              <input
                id="expense-note"
                className="field"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                autoComplete="off"
              />
            </div>
            {formError && <ErrorNote>{formError}</ErrorNote>}
            {notice && (
              <p className="flex items-center gap-2 rounded-lg bg-brand-soft p-3 text-sm font-medium text-brand-dark" role="status">
                <Icon name="check" size={18} />
                {notice}
              </p>
            )}
            <button className="btn btn-primary w-full" disabled={busy}>
              <Icon name="plus" size={18} />
              {busy ? "Saving…" : "Save expense"}
            </button>
          </form>
        </div>

        <div className="mt-4 min-w-0 space-y-4 lg:order-1 lg:mt-0">
          {bills.length > 0 && (
            <section className="card p-4">
              <h2 className="flex items-center gap-2 text-base font-bold"><Icon name="bill" size={18} />Recurring bills</h2>
              <ul className="mt-2 divide-y divide-line">
                {bills.map((bill) => {
                  const days = daysUntil(bill.next_due_on as string, today);
                  const due =
                    days < 0
                      ? { text: `Overdue by ${-days} ${days === -1 ? "day" : "days"}`, className: "bg-danger-soft text-danger" }
                      : days === 0
                        ? { text: "Due today", className: "bg-credit-soft text-credit-dark" }
                        : { text: `Due in ${days} ${days === 1 ? "day" : "days"}`, className: "bg-navy-soft text-navy" };
                  return (
                    <li key={bill.id} className="py-2.5">
                      <div className="flex items-center gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                            <span className="truncate text-sm font-semibold">{bill.name}</span>
                            <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${due.className}`}>{due.text}</span>
                          </div>
                          <div className="money text-xs text-muted">
                            {money(bill.default_amount)} · {frequencyLabels[bill.frequency as keyof typeof frequencyLabels]} · {shortDay(bill.next_due_on as string)}
                          </div>
                        </div>
                        <button
                          type="button"
                          aria-label={`Pay ${bill.name}`}
                          className="btn btn-quiet btn-small shrink-0"
                          onClick={() => {
                            setPaying(bill);
                            setPayAmount(String(bill.default_amount));
                            setPayError("");
                          }}
                        >
                          Pay
                        </button>
                      </div>
                      {paying?.id === bill.id && (
                        <form onSubmit={payBill} className="rise mt-2 rounded-xl bg-paper p-3">
                          <label className="label" htmlFor="bill-amount">Amount paid for {bill.name}</label>
                          <div className="flex gap-2">
                            <input
                              id="bill-amount"
                              className="field money min-w-0 flex-1"
                              type="number"
                              inputMode="decimal"
                              min="0"
                              step="any"
                              value={payAmount}
                              onChange={(e) => setPayAmount(e.target.value)}
                            />
                            <button className="btn btn-primary shrink-0" disabled={payBusy}>{payBusy ? "Saving…" : "Record"}</button>
                            <button type="button" className="btn btn-quiet shrink-0" onClick={() => setPaying(null)}>Cancel</button>
                          </div>
                          {payError && <div className="mt-2"><ErrorNote>{payError}</ErrorNote></div>}
                        </form>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          <RangePicker value={range} onChange={setRange} />
          <div className="grid grid-cols-2 gap-2 sm:gap-3">
            <Stat label="Total expenses" value={summary ? money(summary.expenses_total) : "–"} icon="expenses" tone="danger" />
            <Stat
              label="Balance (income less expenses)"
              value={summary ? money(summary.collected - summary.expenses_total) : "–"}
              icon="wallet"
              tone="brand"
            />
          </div>

          {loadError && <ErrorNote>{loadError}</ErrorNote>}
          {rows === null && !loadError && <p className="text-sm text-muted">Loading expenses…</p>}
          {rows?.length === 0 && <EmptyNote>No expenses in this period.</EmptyNote>}
          {rows && rows.length > 0 && (
            <ul className="card divide-y divide-line">
              {rows.map((row) => (
                <li key={row.id} className="flex items-center gap-3 p-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-danger-soft text-danger">
                    <Icon name="expenses" size={17} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{row.name}</div>
                    <div className="truncate text-xs text-muted">
                      {dateTime(row.created_at)}
                      {row.staff?.username ? ` · by ${row.staff.username}` : ""}
                      {row.due_on ? ` · bill due ${shortDay(row.due_on)}` : ""}
                      {row.note ? ` · ${row.note}` : ""}
                    </div>
                  </div>
                  <span className="money shrink-0 text-sm font-bold">{money(row.amount)}</span>
                  {isAdmin && (
                    <button
                      type="button"
                      aria-label={`Delete expense ${row.name}`}
                      className="flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted hover:bg-danger-soft hover:text-danger"
                      onClick={() => {
                        setDeleteError("");
                        setDeleting(row);
                      }}
                    >
                      <Icon name="trash" size={18} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {count > LIST_LIMIT && (
            <p className="text-center text-xs text-muted">
              Showing the latest {LIST_LIMIT} of {count}. The totals above include all of them.
            </p>
          )}
        </div>
      </div>

      {deleting && (
        <ConfirmDialog
          title="Delete this expense?"
          message={`${deleting.name}, ${money(deleting.amount)}. This cannot be undone.`}
          confirmLabel="Delete expense"
          busy={deleteBusy}
          error={deleteError}
          onConfirm={confirmDelete}
          onCancel={() => setDeleting(null)}
        />
      )}
    </div>
  );
}
