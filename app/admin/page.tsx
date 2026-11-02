"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { FinanceSummary } from "@/components/finance-summary";
import { Avatar, ConfirmDialog, EmptyNote, ErrorNote, Icon, PageTitle, RangePicker } from "@/components/ui";
import { browserTimeZone, frequencyLabels, localDay, money, previousBounds, rangeBounds, shortDay, type DateRange } from "@/lib/format";
import { createSignupClient, supabase } from "@/lib/supabase";
import type { Analytics, BillFrequency, ExpensePreset, Profile, Role, Service } from "@/lib/types";

export default function AdminPage() {
  const { profile } = useAuth();

  if (profile?.role !== "admin") {
    return (
      <EmptyNote>
        <p>Only admins can open this page.</p>
        <Link href="/" className="btn btn-quiet btn-small mt-3">
          Back to selling
        </Link>
      </EmptyNote>
    );
  }

  return (
    <div>
      <PageTitle subtitle="Manage what you sell and who can use the system.">Admin</PageTitle>
      <FinancePanel />
      <div className="mt-6 grid gap-6 lg:grid-cols-2 lg:items-start">
        <div className="space-y-6">
          <ServicesPanel />
          <RecurringBillsPanel />
          <ExpensePresetsPanel />
        </div>
        <div className="space-y-6">
          <UsersPanel />
          <DangerZone />
        </div>
      </div>
    </div>
  );
}

function FinancePanel() {
  const [range, setRange] = useState<DateRange>({ preset: "month", from: "", to: "" });
  const [data, setData] = useState<Analytics | null>(null);
  const [previous, setPrevious] = useState<Analytics | null>(null);
  const [error, setError] = useState("");

  const incompleteCustom = range.preset === "custom" && (!range.from || !range.to);

  useEffect(() => {
    if (incompleteCustom) return;
    let active = true;
    const bounds = rangeBounds(range);
    const before = previousBounds(bounds);
    const timeZone = browserTimeZone();
    Promise.all([
      supabase.rpc("analytics", { p_from: bounds.from, p_to: bounds.to, p_tz: timeZone }),
      supabase.rpc("analytics", { p_from: before.from, p_to: before.to, p_tz: timeZone }),
    ]).then(([current, prior]) => {
      if (!active) return;
      if (current.error) setError(current.error.message);
      else {
        setError("");
        setData(current.data as Analytics);
        setPrevious((prior.data as Analytics | null) ?? null);
      }
    });
    return () => {
      active = false;
    };
  }, [range, incompleteCustom]);

  return (
    <div className="space-y-3">
      <RangePicker value={range} onChange={setRange} />
      {error && <ErrorNote>{error}</ErrorNote>}
      {data && <FinanceSummary data={data} previous={previous} />}
    </div>
  );
}

function RecurringBillsPanel() {
  const [bills, setBills] = useState<ExpensePreset[] | null>(null);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [frequency, setFrequency] = useState<BillFrequency>("monthly");
  const [nextDue, setNextDue] = useState(() => localDay());
  const [editing, setEditing] = useState<ExpensePreset | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let active = true;
    supabase
      .from("expense_presets")
      .select("id, name, default_amount, frequency, next_due_on")
      .not("frequency", "is", null)
      .order("next_due_on")
      .then(({ data, error: loadError }) => {
        if (!active) return;
        if (loadError) setError(loadError.message);
        else setBills(data as ExpensePreset[]);
      });
    return () => {
      active = false;
    };
  }, [version]);

  function clearForm() {
    setEditing(null);
    setName("");
    setAmount("");
    setFrequency("monthly");
    setNextDue(localDay());
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    const cost = Number(amount);
    if (!name.trim()) return setError("Enter a bill name.");
    if (amount === "" || !Number.isFinite(cost) || cost < 0) return setError("Enter a valid amount.");
    if (!nextDue) return setError("Choose the next due date.");

    setBusy(true);
    setError("");
    const values = { name: name.trim(), default_amount: cost, frequency, next_due_on: nextDue };
    const { error: saveError } = editing
      ? await supabase.from("expense_presets").update(values).eq("id", editing.id)
      : await supabase.from("expense_presets").insert(values);
    setBusy(false);
    if (saveError) return setError(saveError.message);
    clearForm();
    setVersion((v) => v + 1);
  }

  async function remove(bill: ExpensePreset) {
    if (!window.confirm(`Remove ${bill.name}? Payments already recorded stay in your expenses.`)) return;
    setError("");
    const { error: deleteError } = await supabase.from("expense_presets").delete().eq("id", bill.id);
    if (deleteError) return setError(deleteError.message);
    if (editing?.id === bill.id) clearForm();
    setVersion((v) => v + 1);
  }

  return (
    <section className="card p-4">
      <h2 className="flex items-center gap-2 text-lg font-bold"><Icon name="bill" />Recurring bills</h2>
      <p className="mt-0.5 text-sm text-muted">Water, rent and other repeating costs. Tap a chip to edit it. They are paid from the Expenses page.</p>

      <div className="mt-3 flex flex-wrap gap-2">
        {bills === null && !error && <p className="text-sm text-muted">Loading…</p>}
        {bills?.length === 0 && <p className="text-sm text-muted">No recurring bills yet. Add your first one below.</p>}
        {bills?.map((bill) => (
          <span
            key={bill.id}
            className={`inline-flex min-h-11 items-center rounded-full border bg-surface ${
              editing?.id === bill.id ? "border-navy ring-1 ring-navy" : "border-[#c3ccd9]"
            }`}
          >
            <button
              type="button"
              className="min-h-11 cursor-pointer rounded-l-full py-1 pl-4 pr-2 text-left"
              onClick={() => {
                setEditing(bill);
                setName(bill.name);
                setAmount(String(bill.default_amount));
                setFrequency(bill.frequency as BillFrequency);
                setNextDue(bill.next_due_on as string);
                setError("");
              }}
            >
              <span className="flex items-center gap-2 text-[15px] font-medium">
                {bill.name}
                <span className="money text-sm font-semibold text-brand">{money(bill.default_amount)}</span>
              </span>
              <span className="block text-xs text-muted">
                {frequencyLabels[bill.frequency as BillFrequency]} · next {shortDay(bill.next_due_on as string)}
              </span>
            </button>
            <button
              type="button"
              aria-label={`Remove ${bill.name}`}
              className="flex size-11 cursor-pointer items-center justify-center rounded-r-full text-muted hover:text-danger"
              onClick={() => remove(bill)}
            >
              <Icon name="remove" size={17} />
            </button>
          </span>
        ))}
      </div>

      <form onSubmit={save} className="mt-4 border-t border-line pt-4">
        <h3 className="mb-2 text-sm font-bold">{editing ? `Edit ${editing.name}` : "Add a recurring bill"}</h3>
        <div className="grid grid-cols-2 gap-2">
          <div className="col-span-2">
            <label className="label" htmlFor="bill-name">Bill</label>
            <input
              id="bill-name"
              className="field"
              placeholder="e.g. Water bill"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="bill-cost">Amount</label>
            <input
              id="bill-cost"
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
          <div>
            <label className="label" htmlFor="bill-frequency">Repeats</label>
            <select
              id="bill-frequency"
              className="field"
              value={frequency}
              onChange={(e) => setFrequency(e.target.value as BillFrequency)}
            >
              {Object.entries(frequencyLabels).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
          <div className="col-span-2">
            <label className="label" htmlFor="bill-due">Next due date</label>
            <input
              id="bill-due"
              className="field"
              type="date"
              value={nextDue}
              onChange={(e) => setNextDue(e.target.value)}
            />
          </div>
        </div>
        <div className="mt-3 flex gap-2">
          {editing && (
            <button type="button" className="btn btn-quiet flex-1" onClick={clearForm}>Cancel</button>
          )}
          <button className="btn btn-primary flex-1" disabled={busy}>
            <Icon name={editing ? "check" : "plus"} size={18} />
            {editing ? "Save bill" : "Add bill"}
          </button>
        </div>
      </form>

      {error && <div className="mt-3"><ErrorNote>{error}</ErrorNote></div>}
    </section>
  );
}

function ServicesPanel() {
  const [services, setServices] = useState<Service[] | null>(null);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [editing, setEditing] = useState<Service | null>(null);
  const [editPrice, setEditPrice] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let active = true;
    supabase
      .from("services")
      .select("id, name, price")
      .order("name")
      .then(({ data, error: loadError }) => {
        if (!active) return;
        if (loadError) setError(loadError.message);
        else setServices(data as Service[]);
      });
    return () => {
      active = false;
    };
  }, [version]);

  async function add(event: React.FormEvent) {
    event.preventDefault();
    const charge = Number(price);
    if (!name.trim()) return setError("Enter a service name.");
    if (price === "" || !Number.isFinite(charge) || charge < 0) return setError("Enter a valid charge.");

    setBusy(true);
    setError("");
    const { error: insertError } = await supabase.from("services").insert({ name: name.trim(), price: charge });
    setBusy(false);
    if (insertError) return setError(insertError.message);
    setName("");
    setPrice("");
    setVersion((v) => v + 1);
  }

  async function remove(service: Service) {
    if (!window.confirm(`Remove ${service.name}? Past sales keep their record of it.`)) return;
    setError("");
    const { error: deleteError } = await supabase.from("services").delete().eq("id", service.id);
    if (deleteError) return setError(deleteError.message);
    if (editing?.id === service.id) setEditing(null);
    setVersion((v) => v + 1);
  }

  async function saveCharge(event: React.FormEvent) {
    event.preventDefault();
    if (!editing) return;
    const charge = Number(editPrice);
    if (editPrice === "" || !Number.isFinite(charge) || charge < 0) return setError("Enter a valid charge.");
    setBusy(true);
    setError("");
    const { error: updateError } = await supabase.from("services").update({ price: charge }).eq("id", editing.id);
    setBusy(false);
    if (updateError) return setError(updateError.message);
    setEditing(null);
    setVersion((v) => v + 1);
  }

  return (
    <section className="card p-4">
      <h2 className="flex items-center gap-2 text-lg font-bold"><Icon name="services" />Services and charges</h2>
      <p className="mt-0.5 text-sm text-muted">Tap a chip to change its charge. Tap × to remove it.</p>

      <div className="mt-3 flex flex-wrap gap-2">
        {services === null && !error && <p className="text-sm text-muted">Loading…</p>}
        {services?.length === 0 && <p className="text-sm text-muted">No services yet. Add your first one below.</p>}
        {services?.map((service) => (
          <span
            key={service.id}
            className={`inline-flex min-h-11 items-center rounded-full border bg-surface ${
              editing?.id === service.id ? "border-navy ring-1 ring-navy" : "border-[#c3ccd9]"
            }`}
          >
            <button
              type="button"
              className="flex min-h-11 cursor-pointer items-center gap-2 rounded-l-full pl-4 pr-2 text-left text-[15px] font-medium"
              onClick={() => {
                setEditing(service);
                setEditPrice(String(service.price));
                setError("");
              }}
            >
              {service.name}
              <span className="money text-sm font-semibold text-brand">{money(service.price)}</span>
            </button>
            <button
              type="button"
              aria-label={`Remove ${service.name}`}
              className="flex size-11 cursor-pointer items-center justify-center rounded-r-full text-lg text-muted hover:text-danger"
              onClick={() => remove(service)}
            >
              <Icon name="remove" size={17} />
            </button>
          </span>
        ))}
      </div>

      {editing && (
        <form onSubmit={saveCharge} className="mt-4 rounded-lg bg-paper p-3">
          <label className="label" htmlFor="edit-charge">Charge for {editing.name}</label>
          <div className="flex gap-2">
            <input
              id="edit-charge"
              className="field money min-w-0 flex-1"
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              value={editPrice}
              onChange={(e) => setEditPrice(e.target.value)}
              autoFocus
            />
            <button className="btn btn-primary" disabled={busy}>Save</button>
            <button type="button" className="btn btn-quiet" onClick={() => setEditing(null)}>Cancel</button>
          </div>
        </form>
      )}

      <form onSubmit={add} className="mt-4 border-t border-line pt-4">
        <h3 className="mb-2 text-sm font-bold">Add a service</h3>
        <div className="grid grid-cols-[minmax(0,1fr)_110px] gap-2">
          <div>
            <label className="label" htmlFor="service-name">Service</label>
            <input
              id="service-name"
              className="field"
              placeholder="e.g. Printing"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="service-charge">Charge</label>
            <input
              id="service-charge"
              className="field money"
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              placeholder="0"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
          </div>
        </div>
        <button className="btn btn-primary mt-3 w-full" disabled={busy}><Icon name="plus" size={18} />Add service</button>
      </form>

      {error && <div className="mt-3"><ErrorNote>{error}</ErrorNote></div>}
    </section>
  );
}

function ExpensePresetsPanel() {
  const [presets, setPresets] = useState<ExpensePreset[] | null>(null);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [editing, setEditing] = useState<ExpensePreset | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let active = true;
    supabase
      .from("expense_presets")
      .select("id, name, default_amount, frequency, next_due_on")
      .is("frequency", null)
      .order("name")
      .then(({ data, error: loadError }) => {
        if (!active) return;
        if (loadError) setError(loadError.message);
        else setPresets(data as ExpensePreset[]);
      });
    return () => {
      active = false;
    };
  }, [version]);

  function clearForm() {
    setEditing(null);
    setName("");
    setAmount("");
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    const cost = Number(amount);
    if (!name.trim()) return setError("Enter an expense name.");
    if (amount === "" || !Number.isFinite(cost) || cost < 0) return setError("Enter a valid default cost.");

    setBusy(true);
    setError("");
    const values = { name: name.trim(), default_amount: cost };
    const { error: saveError } = editing
      ? await supabase.from("expense_presets").update(values).eq("id", editing.id)
      : await supabase.from("expense_presets").insert(values);
    setBusy(false);
    if (saveError) return setError(saveError.message);
    clearForm();
    setVersion((v) => v + 1);
  }

  async function remove(preset: ExpensePreset) {
    if (!window.confirm(`Remove ${preset.name}? Expenses already recorded stay in your records.`)) return;
    setError("");
    const { error: deleteError } = await supabase.from("expense_presets").delete().eq("id", preset.id);
    if (deleteError) return setError(deleteError.message);
    if (editing?.id === preset.id) clearForm();
    setVersion((v) => v + 1);
  }

  return (
    <section className="card p-4">
      <h2 className="flex items-center gap-2 text-lg font-bold"><Icon name="expenses" />Expense presets</h2>
      <p className="mt-0.5 text-sm text-muted">Regular costs, ready to pick on the Expenses page. Tap a chip to edit it.</p>

      <div className="mt-3 flex flex-wrap gap-2">
        {presets === null && !error && <p className="text-sm text-muted">Loading…</p>}
        {presets?.length === 0 && <p className="text-sm text-muted">No presets yet. Add rent, power, paper and so on below.</p>}
        {presets?.map((preset) => (
          <span
            key={preset.id}
            className={`inline-flex min-h-11 items-center rounded-full border bg-surface ${
              editing?.id === preset.id ? "border-navy ring-1 ring-navy" : "border-[#c3ccd9]"
            }`}
          >
            <button
              type="button"
              className="flex min-h-11 cursor-pointer items-center gap-2 rounded-l-full pl-4 pr-2 text-left text-[15px] font-medium"
              onClick={() => {
                setEditing(preset);
                setName(preset.name);
                setAmount(String(preset.default_amount));
                setError("");
              }}
            >
              {preset.name}
              <span className="money text-sm font-semibold text-brand">{money(preset.default_amount)}</span>
            </button>
            <button
              type="button"
              aria-label={`Remove ${preset.name}`}
              className="flex size-11 cursor-pointer items-center justify-center rounded-r-full text-muted hover:text-danger"
              onClick={() => remove(preset)}
            >
              <Icon name="remove" size={17} />
            </button>
          </span>
        ))}
      </div>

      <form onSubmit={save} className="mt-4 border-t border-line pt-4">
        <h3 className="mb-2 text-sm font-bold">{editing ? `Edit ${editing.name}` : "Add a preset"}</h3>
        <div className="grid grid-cols-[minmax(0,1fr)_110px] gap-2">
          <div>
            <label className="label" htmlFor="preset-name">Expense</label>
            <input
              id="preset-name"
              className="field"
              placeholder="e.g. Rent"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="preset-cost">Default cost</label>
            <input
              id="preset-cost"
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
        <div className="mt-3 flex gap-2">
          {editing && (
            <button type="button" className="btn btn-quiet flex-1" onClick={clearForm}>Cancel</button>
          )}
          <button className="btn btn-primary flex-1" disabled={busy}>
            <Icon name={editing ? "check" : "plus"} size={18} />
            {editing ? "Save preset" : "Add preset"}
          </button>
        </div>
      </form>

      {error && <div className="mt-3"><ErrorNote>{error}</ErrorNote></div>}
    </section>
  );
}

function DangerZone() {
  const [target, setTarget] = useState<"sales" | "expenses" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function clearAll() {
    if (!target) return;
    setBusy(true);
    setError("");
    const { data, error: rpcError } = await supabase.rpc(target === "sales" ? "clear_sales" : "clear_expenses", {
      p_confirm: "DELETE",
    });
    setBusy(false);
    if (rpcError) return setError(rpcError.message);
    setNotice(`Deleted ${data} ${target === "sales" ? "sales" : "expenses"}.`);
    setTarget(null);
  }

  return (
    <section className="card border-[#eab8b8]! p-4">
      <h2 className="flex items-center gap-2 text-lg font-bold text-danger"><Icon name="warning" />Reset data</h2>
      <p className="mt-0.5 text-sm text-muted">Permanently removes records. There is no undo.</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          className="btn btn-danger-quiet"
          onClick={() => {
            setError("");
            setNotice("");
            setTarget("sales");
          }}
        >
          <Icon name="trash" size={18} />
          Clear all sales
        </button>
        <button
          type="button"
          className="btn btn-danger-quiet"
          onClick={() => {
            setError("");
            setNotice("");
            setTarget("expenses");
          }}
        >
          <Icon name="trash" size={18} />
          Clear all expenses
        </button>
      </div>
      {notice && (
        <p className="mt-3 rounded-lg bg-brand-soft p-3 text-sm text-brand-dark" role="status">
          {notice}
        </p>
      )}
      {target && (
        <ConfirmDialog
          title={target === "sales" ? "Clear all sales?" : "Clear all expenses?"}
          message={
            target === "sales"
              ? "Every sale and payment will be permanently deleted, and all client balances go to zero. Clients and services stay. This cannot be undone."
              : "Every expense entry will be permanently deleted. Presets stay. This cannot be undone."
          }
          confirmLabel="Clear all"
          requireText="DELETE"
          busy={busy}
          error={error}
          onConfirm={clearAll}
          onCancel={() => setTarget(null)}
        />
      )}
    </section>
  );
}

function UsersPanel() {
  const { profile, refreshProfile } = useAuth();
  const [users, setUsers] = useState<Profile[] | null>(null);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let active = true;
    supabase
      .from("profiles")
      .select("id, email, username, role")
      .order("username")
      .then(({ data, error: loadError }) => {
        if (!active) return;
        if (loadError) setError(loadError.message);
        else setUsers(data as Profile[]);
      });
    return () => {
      active = false;
    };
  }, [version]);

  async function changeRole(user: Profile, role: Role) {
    if (user.id === profile?.id && !window.confirm("Remove your own admin access?")) return;
    setError("");
    setNotice("");
    const { error: rpcError } = await supabase.rpc("set_user_role", { p_user_id: user.id, p_role: role });
    if (rpcError) return setError(rpcError.message);
    setVersion((v) => v + 1);
    if (user.id === profile?.id) refreshProfile();
  }

  async function addUser(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");

    const cleanEmail = email.trim().toLowerCase();
    const { error: allowError } = await supabase.rpc("allow_email", { p_email: cleanEmail });
    if (allowError) {
      setBusy(false);
      return setError(allowError.message);
    }

    const { data, error: signUpError } = await createSignupClient().auth.signUp({
      email: cleanEmail,
      password,
      options: { data: { username: username.trim() } },
    });
    setBusy(false);

    if (signUpError) return setError(signUpError.message);
    if (!data.session) {
      // With "Confirm email" on, Supabase returns no session and the account cannot log in yet.
      setNotice(`${username.trim()} was created, but they must confirm their email before logging in.`);
    } else {
      setNotice(`${username.trim()} can now log in as staff.`);
    }
    setUsername("");
    setEmail("");
    setPassword("");
    setVersion((v) => v + 1);
  }

  return (
    <section className="card p-4">
      <h2 className="flex items-center gap-2 text-lg font-bold"><Icon name="clients" />Users</h2>

      <ul className="mt-2 divide-y divide-line">
        {users === null && !error && <li className="py-2 text-sm text-muted">Loading…</li>}
        {users?.map((user) => (
          <li key={user.id} className="flex items-center justify-between gap-3 py-2.5">
            <Avatar name={user.username} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2">
                <span className="truncate font-semibold">
                  {user.username}
                  {user.id === profile?.id && <span className="font-normal text-muted"> (you)</span>}
                </span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${user.role === "admin" ? "bg-navy text-white" : "bg-navy-soft text-navy"}`}>
                  {user.role === "admin" ? "Admin" : "Staff"}
                </span>
              </div>
              <div className="truncate text-sm text-muted">{user.email}</div>
            </div>
            {user.role === "admin" ? (
              <button className="btn btn-quiet btn-small shrink-0" onClick={() => changeRole(user, "staff")}>
                Make staff
              </button>
            ) : (
              <button className="btn btn-quiet btn-small shrink-0" onClick={() => changeRole(user, "admin")}>
                Make admin
              </button>
            )}
          </li>
        ))}
      </ul>

      <form onSubmit={addUser} className="mt-4 space-y-3 border-t border-line pt-4">
        <h3 className="text-sm font-bold">Add a user</h3>
        <div>
          <label className="label" htmlFor="new-username">Username</label>
          <input id="new-username" className="field" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="off" required />
        </div>
        <div>
          <label className="label" htmlFor="new-email">Email</label>
          <input id="new-email" type="email" className="field" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" required />
        </div>
        <div>
          <label className="label" htmlFor="new-password">Password</label>
          <input id="new-password" type="password" className="field" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" minLength={6} required />
        </div>
        <button className="btn btn-primary w-full" disabled={busy}>
          <Icon name="addUser" size={18} />{busy ? "Adding…" : "Add user"}
        </button>
      </form>

      {error && <div className="mt-3"><ErrorNote>{error}</ErrorNote></div>}
      {notice && (
        <p className="mt-3 rounded-lg bg-brand-soft p-3 text-sm text-brand-dark" role="status">
          {notice}
        </p>
      )}
    </section>
  );
}
