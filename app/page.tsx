"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { ErrorNote, Stat } from "@/components/ui";
import { browserTimeZone, money, rangeBounds } from "@/lib/format";
import { cleanSearch, supabase } from "@/lib/supabase";
import type { Analytics, ClientBalance, Service } from "@/lib/types";

type Cart = Record<string, number>;
type FieldErrors = { name?: string; phone?: string; deposit?: string };

export default function SellPage() {
  const { profile } = useAuth();
  const [services, setServices] = useState<Service[] | null>(null);
  const [summary, setSummary] = useState<Analytics | null>(null);
  const [loadError, setLoadError] = useState("");
  const [savedCount, setSavedCount] = useState(0);

  const [cart, setCart] = useState<Cart>({});
  const [sheetOpen, setSheetOpen] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [client, setClient] = useState<ClientBalance | null>(null);
  const [deposit, setDeposit] = useState("");
  const [matches, setMatches] = useState<ClientBalance[]>([]);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [saveError, setSaveError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    supabase
      .from("services")
      .select("id, name, price")
      .order("name")
      .then(({ data, error }) => {
        if (!active) return;
        if (error) setLoadError(error.message);
        else setServices(data as Service[]);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    const { from, to } = rangeBounds({ preset: "today", from: "", to: "" });
    supabase
      .rpc("analytics", { p_from: from, p_to: to, p_tz: browserTimeZone() })
      .then(({ data }) => {
        if (active && data) setSummary(data as Analytics);
      });
    return () => {
      active = false;
    };
  }, [savedCount]);

  // Offers existing clients while the name or phone is being typed.
  const query = cleanSearch(name || phone);
  useEffect(() => {
    if (client || query.length < 2) return;
    let active = true;
    const timer = setTimeout(() => {
      supabase
        .from("client_balances")
        .select("*")
        .or(`name.ilike.%${query}%,phone.ilike.%${query}%`)
        .order("name")
        .limit(5)
        .then(({ data }) => {
          if (active) setMatches((data as ClientBalance[]) ?? []);
        });
    }, 200);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query, client]);

  const lines = useMemo(
    () =>
      (services ?? [])
        .filter((service) => cart[service.id])
        .map((service) => ({ ...service, quantity: cart[service.id] })),
    [services, cart],
  );
  const total = lines.reduce((sum, line) => sum + line.price * line.quantity, 0);
  const count = lines.reduce((sum, line) => sum + line.quantity, 0);
  const visibleMatches = !client && query.length >= 2 ? matches : [];

  function toggle(id: string) {
    setCart((current) => {
      const next = { ...current };
      if (next[id]) delete next[id];
      else next[id] = 1;
      return next;
    });
    setNotice("");
  }

  function setQuantity(id: string, quantity: number) {
    setCart((current) => {
      const next = { ...current };
      if (quantity <= 0) delete next[id];
      else next[id] = quantity;
      return next;
    });
  }

  function reset() {
    setCart({});
    setName("");
    setPhone("");
    setClient(null);
    setDeposit("");
    setMatches([]);
    setFieldErrors({});
    setSaveError("");
    setSheetOpen(false);
  }

  async function save(kind: "paid" | "credit") {
    const errors: FieldErrors = {};
    const paidNow = kind === "paid" ? total : Number(deposit || 0);

    if (kind === "credit") {
      if (!client && !name.trim()) errors.name = "Name is required for credit.";
      if (!client && !phone.trim()) errors.phone = "Phone is required for credit.";
      if (!Number.isFinite(paidNow) || paidNow < 0) errors.deposit = "Enter a valid amount.";
      else if (paidNow >= total) errors.deposit = "This covers the full total. Use Save as paid.";
    }

    setFieldErrors(errors);
    setSaveError("");
    if (Object.keys(errors).length > 0) return;

    setBusy(true);
    const { error } = await supabase.rpc("create_sale", {
      p_items: lines.map((line) => ({ service_id: line.id, quantity: line.quantity })),
      p_amount_paid: paidNow,
      p_customer_name: client ? null : name,
      p_phone: client ? null : phone,
      p_client_id: client?.id ?? null,
    });
    setBusy(false);

    if (error) {
      setSaveError(error.message);
      return;
    }

    const who = client?.name || name.trim() || "Walk-in";
    setNotice(
      kind === "paid"
        ? `Saved ${money(total)} from ${who}.`
        : `Saved ${money(total)} for ${who}. ${money(total - paidNow)} on credit.`,
    );
    reset();
    setSavedCount((n) => n + 1);
  }

  return (
    <div className="pb-20 lg:grid lg:grid-cols-[1fr_380px] lg:items-start lg:gap-6 lg:pb-0">
      <div className="min-w-0">
        <h1 className="mb-2 text-sm font-semibold text-muted">Today</h1>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
          <Stat label="Total sales" value={summary ? money(summary.sales_total) : "–"} />
          <Stat label="Money received" value={summary ? money(summary.collected) : "–"} tone="brand" />
          <Stat label="Given on credit" value={summary ? money(summary.credit_given) : "–"} tone="credit" />
          <Stat label="Number of sales" value={summary ? String(summary.sale_count) : "–"} />
        </div>

        {notice && (
          <p className="mt-3 rounded-lg bg-brand-soft p-3 text-sm font-medium text-brand-dark" role="status">
            {notice}
          </p>
        )}
        {loadError && <div className="mt-3"><ErrorNote>{loadError}</ErrorNote></div>}

        <h2 className="mb-3 mt-6 text-base font-bold">Select services</h2>
        {services === null && !loadError && <p className="text-sm text-muted">Loading services…</p>}
        {services?.length === 0 && (
          <div className="card p-6 text-center text-sm text-muted">
            <p>No services yet.</p>
            {profile?.role === "admin" ? (
              <Link href="/admin" className="btn btn-primary btn-small mt-3">
                Add services
              </Link>
            ) : (
              <p className="mt-1">Ask an admin to add them.</p>
            )}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          {services?.map((service) => {
            const selected = Boolean(cart[service.id]);
            return (
              <button
                key={service.id}
                type="button"
                aria-pressed={selected}
                onClick={() => toggle(service.id)}
                className={`flex min-h-12 cursor-pointer items-center gap-2 rounded-full border px-4 py-2 text-left text-[15px] font-medium transition-colors ${
                  selected
                    ? "border-brand bg-brand text-white"
                    : "border-[#c6cbbf] bg-surface text-ink hover:border-brand"
                }`}
              >
                <span>{service.name}</span>
                <span className={`money text-sm font-semibold ${selected ? "text-white/85" : "text-brand"}`}>
                  {money(service.price)}
                </span>
                {selected && cart[service.id] > 1 && (
                  <span className="money rounded-full bg-white/20 px-1.5 text-xs font-bold">×{cart[service.id]}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Phone: a sticky total bar opens this as a bottom sheet. Desktop: a side panel. */}
      {lines.length > 0 && !sheetOpen && (
        <div className="fixed inset-x-0 bottom-[calc(56px+env(safe-area-inset-bottom))] z-10 border-t border-line bg-surface p-3 md:bottom-0 lg:hidden">
          <button
            className="btn btn-primary w-full justify-between"
            onClick={() => {
              setSheetOpen(true);
            }}
          >
            <span>{count} {count === 1 ? "item" : "items"} · Continue</span>
            <span className="money text-base">{money(total)}</span>
          </button>
        </div>
      )}

      {sheetOpen && lines.length > 0 && (
        <button
          aria-label="Close"
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={() => setSheetOpen(false)}
        />
      )}

      <aside
        className={`${sheetOpen && lines.length > 0 ? "fixed" : "hidden"} inset-x-0 bottom-0 z-40 max-h-[90dvh] overflow-y-auto rounded-t-2xl bg-surface p-4 pb-[calc(16px+env(safe-area-inset-bottom))] shadow-2xl lg:sticky lg:top-20 lg:bottom-auto lg:block lg:max-h-[calc(100dvh-6rem)] lg:rounded-2xl lg:border lg:border-line lg:shadow-none`}
        aria-label="Checkout"
      >
        {lines.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted">Select services to start a sale.</p>
        ) : (
          <>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-base font-bold">Checkout</h2>
              <button className="btn-small cursor-pointer text-sm font-medium text-muted lg:hidden" onClick={() => setSheetOpen(false)}>
                Close
              </button>
            </div>

            <ul className="divide-y divide-line">
              {lines.map((line) => (
                <li key={line.id} className="flex items-center gap-2 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{line.name}</div>
                    <div className="money text-xs text-muted">{money(line.price * line.quantity)}</div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      aria-label={`Fewer ${line.name}`}
                      className="btn btn-quiet btn-small w-10 px-0"
                      onClick={() => setQuantity(line.id, line.quantity - 1)}
                    >
                      −
                    </button>
                    <span className="money w-7 text-center text-sm font-semibold">{line.quantity}</span>
                    <button
                      type="button"
                      aria-label={`More ${line.name}`}
                      className="btn btn-quiet btn-small w-10 px-0"
                      onClick={() => setQuantity(line.id, line.quantity + 1)}
                    >
                      +
                    </button>
                  </div>
                </li>
              ))}
            </ul>

            <div className="mt-1 flex items-baseline justify-between border-t-2 border-ink pt-2">
              <span className="font-semibold">Total</span>
              <span className="money text-2xl font-bold">{money(total)}</span>
            </div>

            <div className="mt-4 space-y-3">
              {client ? (
                <div className="flex items-center justify-between gap-2 rounded-lg bg-paper p-3">
                  <div className="min-w-0 text-sm">
                    <div className="truncate font-semibold">{client.name}</div>
                    <div className="text-muted">
                      {client.phone}
                      {client.balance > 0 && <span className="money text-credit"> · owes {money(client.balance)}</span>}
                    </div>
                  </div>
                  <button className="btn btn-quiet btn-small" onClick={() => setClient(null)}>
                    Change
                  </button>
                </div>
              ) : (
                <>
                  <div className="relative">
                    <label className="label" htmlFor="customer-name">
                      Customer name
                    </label>
                    <input
                      id="customer-name"
                      className="field"
                      placeholder="Walk-in"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      aria-invalid={Boolean(fieldErrors.name)}
                      autoComplete="off"
                    />
                    {fieldErrors.name && <p className="mt-1 text-xs text-danger">{fieldErrors.name}</p>}
                  </div>
                  <div>
                    <label className="label" htmlFor="customer-phone">
                      Phone
                    </label>
                    <input
                      id="customer-phone"
                      className="field"
                      type="tel"
                      inputMode="tel"
                      placeholder="Needed for credit"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      aria-invalid={Boolean(fieldErrors.phone)}
                      autoComplete="off"
                    />
                    {fieldErrors.phone && <p className="mt-1 text-xs text-danger">{fieldErrors.phone}</p>}
                  </div>
                  {visibleMatches.length > 0 && (
                    <div>
                      <div className="mb-1 text-xs font-semibold text-muted">Existing clients</div>
                      <div className="flex flex-wrap gap-2">
                        {visibleMatches.map((match) => (
                          <button
                            key={match.id}
                            type="button"
                            className="min-h-10 cursor-pointer rounded-full border border-[#c6cbbf] bg-paper px-3 text-left text-sm hover:border-brand"
                            onClick={() => {
                              setClient(match);
                              setFieldErrors({});
                            }}
                          >
                            <span className="font-medium">{match.name}</span>{" "}
                            <span className="text-muted">{match.phone}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}

              <div>
                <label className="label" htmlFor="deposit">
                  Paid now, if on credit <span className="font-normal text-muted">(optional)</span>
                </label>
                <input
                  id="deposit"
                  className="field money"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="any"
                  placeholder="0"
                  value={deposit}
                  onChange={(e) => setDeposit(e.target.value)}
                  aria-invalid={Boolean(fieldErrors.deposit)}
                />
                {fieldErrors.deposit && <p className="mt-1 text-xs text-danger">{fieldErrors.deposit}</p>}
              </div>

              {saveError && <ErrorNote>{saveError}</ErrorNote>}

              <div className="grid grid-cols-2 gap-2 pt-1">
                <button className="btn btn-primary" disabled={busy} onClick={() => save("paid")}>
                  Save as paid
                </button>
                <button className="btn btn-credit" disabled={busy} onClick={() => save("credit")}>
                  Save as credit
                </button>
              </div>
            </div>
          </>
        )}
      </aside>
    </div>
  );
}
