"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { describePayments, emptyPayment, linesTotal, PaymentFields, paymentLines, type PaymentDraft } from "@/components/payment-fields";
import { Avatar, CountUpMoney, Delta, ErrorNote, Icon, Sparkline, StatusBadge } from "@/components/ui";
import { browserTimeZone, money, percentChange, rangeBounds, timeOnly } from "@/lib/format";
import { cleanSearch, supabase } from "@/lib/supabase";
import type { Analytics, ClientBalance, SaleRow, SalesSearchResult, Service } from "@/lib/types";

type Cart = Record<string, number>;
type FieldErrors = { name?: string; phone?: string; payment?: string; price?: string };

export default function SellPage() {
  const { profile } = useAuth();
  const [services, setServices] = useState<Service[] | null>(null);
  const [today, setToday] = useState<Analytics | null>(null);
  const [week, setWeek] = useState<Analytics["by_day"]>([]);
  const [recent, setRecent] = useState<SaleRow[]>([]);
  const [loadError, setLoadError] = useState("");
  const [savedCount, setSavedCount] = useState(0);
  const [dateLabel] = useState(() =>
    new Date().toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" }),
  );

  const [cart, setCart] = useState<Cart>({});
  const [sheetOpen, setSheetOpen] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [client, setClient] = useState<ClientBalance | null>(null);
  const [payment, setPayment] = useState<PaymentDraft>(emptyPayment);
  const [prices, setPrices] = useState<Record<string, string>>({});
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
    const timeZone = browserTimeZone();
    const todayBounds = rangeBounds({ preset: "today", from: "", to: "" });
    const weekBounds = rangeBounds({ preset: "week", from: "", to: "" });
    Promise.all([
      supabase.rpc("analytics", { p_from: todayBounds.from, p_to: todayBounds.to, p_tz: timeZone }),
      supabase.rpc("analytics", { p_from: weekBounds.from, p_to: weekBounds.to, p_tz: timeZone }),
      supabase.rpc("search_sales", { p_from: todayBounds.from, p_to: todayBounds.to, p_limit: 6 }),
    ]).then(([todayResult, weekResult, recentResult]) => {
      if (!active) return;
      if (todayResult.data) setToday(todayResult.data as Analytics);
      if (weekResult.data) setWeek((weekResult.data as Analytics).by_day);
      if (recentResult.data) setRecent((recentResult.data as SalesSearchResult).rows);
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

  // A price typed at checkout replaces the service's own for this sale only.
  const lines = useMemo(
    () =>
      (services ?? [])
        .filter((service) => cart[service.id])
        .map((service) => {
          const typed = prices[service.id];
          const unitPrice = typed === undefined ? service.price : Number(typed);
          const validPrice = typed !== "" && Number.isFinite(unitPrice) && unitPrice >= 0;
          return {
            ...service,
            quantity: cart[service.id],
            unitPrice: validPrice ? unitPrice : 0,
            validPrice,
          };
        }),
    [services, cart, prices],
  );
  const total = lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);
  const count = lines.reduce((sum, line) => sum + line.quantity, 0);
  const visibleMatches = !client && query.length >= 2 ? matches : [];

  const yesterdaySales = week.length >= 2 ? week[week.length - 2].sales : 0;
  const salesChange = today ? percentChange(today.sales_total, yesterdaySales) : null;
  const collectionRate = today && today.sales_total > 0
    ? Math.round(((today.sales_total - today.credit_given) / today.sales_total) * 100)
    : null;

  function toggle(id: string) {
    setCart((current) => {
      const next = { ...current };
      if (next[id]) delete next[id];
      else next[id] = 1;
      return next;
    });
    setPrices((current) => {
      const next = { ...current };
      delete next[id];
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
    setPrices({});
    setName("");
    setPhone("");
    setClient(null);
    setPayment(emptyPayment);
    setMatches([]);
    setFieldErrors({});
    setSaveError("");
    setSheetOpen(false);
  }

  async function save(kind: "paid" | "credit") {
    const errors: FieldErrors = {};
    const payments = paymentLines(payment, kind === "paid" && payment.choice !== "split" ? total : undefined);
    const paidNow = payments ? linesTotal(payments) : 0;

    if (lines.some((line) => !line.validPrice)) errors.price = "Enter a valid price for every service.";

    if (!payments) {
      errors.payment = "Enter a valid amount.";
    } else if (kind === "paid" && Math.abs(paidNow - total) >= 0.005) {
      errors.payment = "The split must add up to the total.";
    } else if (kind === "credit" && paidNow >= total) {
      errors.payment = "This covers the full total. Use Save as paid.";
    }

    if (kind === "credit") {
      if (!client && !name.trim()) errors.name = "Name is required for credit.";
      if (!client && !phone.trim()) errors.phone = "Phone is required for credit.";
    }

    setFieldErrors(errors);
    setSaveError("");
    if (Object.keys(errors).length > 0 || !payments) return;

    setBusy(true);
    const { error } = await supabase.rpc("create_sale", {
      p_items: lines.map((line) => ({ service_id: line.id, quantity: line.quantity, unit_price: line.unitPrice })),
      p_payments: payments,
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
    const breakdown = payments.length > 0 ? ` ${describePayments(payments)}.` : "";
    setNotice(
      kind === "paid"
        ? `Saved ${money(total)} from ${who}.${breakdown}`
        : `Saved ${money(total)} for ${who}. ${money(total - paidNow)} on credit.${breakdown}`,
    );
    reset();
    setSavedCount((n) => n + 1);
  }

  return (
    <div className="pb-20 lg:grid lg:grid-cols-[minmax(0,1fr)_370px] lg:items-start lg:gap-6 lg:pb-0">
      <div className="min-w-0">
        <section className="hero rise p-4 sm:p-6" aria-label="Today's summary">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-medium text-white/70 sm:text-sm">Total sales today · {dateLabel}</p>
              <p className="money mt-1 truncate text-3xl font-bold sm:text-5xl">
                <CountUpMoney value={today?.sales_total ?? 0} />
              </p>
              <div className="mt-2">
                <Delta change={salesChange} onDark suffix="vs yesterday" emptyLabel="No sales yesterday to compare" />
              </div>
            </div>
            <div className="w-24 shrink-0 sm:w-44">
              <Sparkline values={week.map((day) => day.sales)} label="Sales over the last 7 days" />
              <p className="mt-0.5 text-right text-[11px] text-white/60">Last 7 days</p>
            </div>
          </div>

          <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-white/15 pt-3 sm:gap-4">
            <div className="min-w-0">
              <dt className="truncate text-xs text-white/70">Money received</dt>
              <dd className="money truncate text-sm font-bold text-mint sm:text-xl">{money(today?.collected ?? 0)}</dd>
            </div>
            <div className="min-w-0">
              <dt className="truncate text-xs text-white/70">Given on credit</dt>
              <dd className="money truncate text-sm font-bold text-gold sm:text-xl">{money(today?.credit_given ?? 0)}</dd>
            </div>
            <div className="min-w-0">
              <dt className="truncate text-xs text-white/70">Number of sales</dt>
              <dd className="money truncate text-sm font-bold sm:text-xl">{today?.sale_count ?? 0}</dd>
            </div>
          </dl>

          <p className="money mt-2 text-xs text-white/70">
            Cash {money(today?.by_method.cash ?? 0)} · M-PESA {money(today?.by_method.mpesa ?? 0)}
          </p>

          {collectionRate !== null && (
            <div className="mt-3">
              <div className="flex justify-between text-xs text-white/70">
                <span>Paid so far of today&apos;s sales</span>
                <span className="money font-semibold text-white">{collectionRate}%</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/15">
                <div className="h-full rounded-full bg-mint transition-[width] duration-700" style={{ width: `${collectionRate}%` }} />
              </div>
            </div>
          )}
        </section>

        {notice && (
          <p className="rise mt-3 flex items-center gap-2 rounded-xl bg-brand-soft p-3 text-sm font-medium text-brand-dark" role="status">
            <Icon name="check" size={18} />
            {notice}
          </p>
        )}
        {loadError && <div className="mt-3"><ErrorNote>{loadError}</ErrorNote></div>}

        <div className="mb-3 mt-6 flex items-baseline justify-between gap-3">
          <h2 className="flex items-center gap-2 text-base font-bold"><Icon name="services" size={18} />Select services</h2>
          {services && services.length > 0 && <span className="text-xs text-muted">{services.length} available</span>}
        </div>
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
                className="chip"
              >
                <span className={`flex size-9 shrink-0 items-center justify-center rounded-full ${selected ? "bg-mint text-navy" : "bg-navy-soft text-navy"}`}>
                  {selected ? <Icon name="check" size={18} /> : <span className="text-sm font-bold">{service.name.trim()[0]?.toUpperCase()}</span>}
                </span>
                <span>
                  <span className="block leading-tight">{service.name}</span>
                  <span className={`money block text-[13px] font-semibold leading-tight ${selected ? "text-mint" : "text-brand"}`}>
                    {money(lines.find((line) => line.id === service.id)?.unitPrice ?? service.price)}
                    {cart[service.id] > 1 ? ` × ${cart[service.id]}` : ""}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        <section className="mt-6">
          <div className="mb-2 flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-base font-bold"><Icon name="sales" size={18} />Recent sales today</h2>
            <Link href="/sales" className="flex items-center gap-1 text-sm font-medium text-brand">
              All sales <Icon name="arrow" size={15} />
            </Link>
          </div>
          {recent.length === 0 ? (
            <div className="card p-6 text-center text-sm text-muted">Today&apos;s sales will appear here.</div>
          ) : (
            <ul className="card divide-y divide-line">
              {recent.map((sale) => (
                <li key={sale.id} className="flex items-center gap-3 p-3">
                  <Avatar name={sale.customer_name} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{sale.customer_name}</div>
                    <div className="truncate text-xs text-muted">
                      {timeOnly(sale.created_at)} · {sale.items.map((item) => item.name).join(", ")}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="money text-sm font-bold">{money(sale.total)}</div>
                    <StatusBadge status={sale.status} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Phone: a sticky total bar opens this as a bottom sheet. Desktop: a side panel. */}
      {lines.length > 0 && !sheetOpen && (
        <div className="rise fixed inset-x-0 bottom-[calc(57px+env(safe-area-inset-bottom))] z-10 border-t border-line bg-surface p-3 lg:hidden">
          <button className="btn btn-navy w-full !justify-between" onClick={() => setSheetOpen(true)}>
            <span className="flex items-center gap-2"><Icon name="sell" size={18} />{count} {count === 1 ? "item" : "items"} · Continue</span>
            <span className="money text-base text-mint">{money(total)}</span>
          </button>
        </div>
      )}

      {sheetOpen && lines.length > 0 && (
        <button
          aria-label="Close"
          className="fixed inset-0 z-30 bg-navy/60 backdrop-blur-[2px] lg:hidden"
          onClick={() => setSheetOpen(false)}
        />
      )}

      <aside
        className={`${sheetOpen && lines.length > 0 ? "sheet-up fixed" : "hidden"} card inset-x-0 bottom-0 z-40 max-h-[90dvh] overflow-y-auto !rounded-b-none !rounded-t-2xl p-4 pb-[calc(16px+env(safe-area-inset-bottom))] lg:sticky lg:top-7 lg:bottom-auto lg:block lg:max-h-[calc(100dvh-3.5rem)] lg:!rounded-2xl lg:pb-4`}
        aria-label="Checkout"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-lg bg-navy text-white">
              <Icon name="sales" size={17} />
            </span>
            <h2 className="text-base font-bold">Current sale</h2>
          </div>
          {lines.length > 0 && (
            <button className="min-h-10 cursor-pointer px-2 text-sm font-medium text-muted lg:hidden" onClick={() => setSheetOpen(false)}>
              Close
            </button>
          )}
        </div>

        {lines.length === 0 ? (
          <div className="py-10 text-center">
            <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-navy-soft text-navy">
              <Icon name="sell" />
            </span>
            <p className="mt-3 text-sm text-muted">Select services to start a sale.</p>
          </div>
        ) : (
          <>
            <ul className="mt-3 space-y-3">
              {lines.map((line) => (
                <li key={line.id}>
                  <div className="flex items-baseline text-sm">
                    <span className="truncate font-medium">{line.name}</span>
                    <span className="leader" />
                    <span className="money shrink-0 font-semibold">{money(line.unitPrice * line.quantity)}</span>
                  </div>
                  <div className="mt-1 flex items-center gap-1">
                    <button
                      type="button"
                      aria-label={`Fewer ${line.name}`}
                      className="btn btn-quiet btn-small !min-h-9 w-9 !px-0"
                      onClick={() => setQuantity(line.id, line.quantity - 1)}
                    >
                      <Icon name="minus" size={15} />
                    </button>
                    <span className="money w-7 text-center text-sm font-semibold">{line.quantity}</span>
                    <button
                      type="button"
                      aria-label={`More ${line.name}`}
                      className="btn btn-quiet btn-small !min-h-9 w-9 !px-0"
                      onClick={() => setQuantity(line.id, line.quantity + 1)}
                    >
                      <Icon name="plus" size={15} />
                    </button>
                    <span className="ml-2 text-xs text-muted">@</span>
                    <input
                      aria-label={`Price for ${line.name}`}
                      className="field money !min-h-9 !w-24 !px-2"
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="any"
                      value={prices[line.id] ?? String(line.price)}
                      onChange={(e) => {
                        const value = e.target.value;
                        setPrices((current) => ({ ...current, [line.id]: value }));
                        setFieldErrors((current) => ({ ...current, price: undefined }));
                      }}
                      aria-invalid={!line.validPrice}
                    />
                    {line.validPrice && line.unitPrice !== line.price && (
                      <span className="money ml-1 truncate text-xs text-muted">was {money(line.price)}</span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            {fieldErrors.price && <p className="mt-2 text-xs text-danger">{fieldErrors.price}</p>}

            <div className="tear" />

            <div className="flex items-baseline justify-between">
              <span className="font-semibold">Total</span>
              <span className="money text-3xl font-bold">{money(total)}</span>
            </div>

            <div className="tear" />

            <div className="space-y-3">
              {client ? (
                <div className="flex items-center justify-between gap-2 rounded-xl bg-paper p-3">
                  <div className="flex min-w-0 items-center gap-2.5 text-sm">
                    <Avatar name={client.name} size={34} />
                    <div className="min-w-0">
                      <div className="truncate font-semibold">{client.name}</div>
                      <div className="text-muted">
                        {client.phone}
                        {client.balance > 0 && <span className="money text-credit"> · owes {money(client.balance)}</span>}
                      </div>
                    </div>
                  </div>
                  <button className="btn btn-quiet btn-small" onClick={() => setClient(null)}>
                    Change
                  </button>
                </div>
              ) : (
                <>
                  <div>
                    <label className="label" htmlFor="customer-name">Customer name</label>
                    <input
                      id="customer-name"
                      className="field"
                      placeholder="Walk-in"
                      value={name}
                      onChange={(e) => {
                        setName(e.target.value);
                        setFieldErrors((current) => ({ ...current, name: undefined }));
                      }}
                      aria-invalid={Boolean(fieldErrors.name)}
                      autoComplete="off"
                    />
                    {fieldErrors.name && <p className="mt-1 text-xs text-danger">{fieldErrors.name}</p>}
                  </div>
                  <div>
                    <label className="label" htmlFor="customer-phone">Phone</label>
                    <input
                      id="customer-phone"
                      className="field"
                      type="tel"
                      inputMode="tel"
                      placeholder="Needed for credit"
                      value={phone}
                      onChange={(e) => {
                        setPhone(e.target.value);
                        setFieldErrors((current) => ({ ...current, phone: undefined }));
                      }}
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
                            className="min-h-10 cursor-pointer rounded-full border border-[#c3ccd9] bg-paper px-3 text-left text-sm hover:border-brand"
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
                <PaymentFields
                  value={payment}
                  onChange={(next) => {
                    setPayment(next);
                    setFieldErrors((current) => ({ ...current, payment: undefined }));
                  }}
                  amountLabel="Paid now, if on credit"
                  amountHint="(optional)"
                  target={total}
                  invalid={Boolean(fieldErrors.payment)}
                />
                {fieldErrors.payment && <p className="mt-1 text-xs text-danger">{fieldErrors.payment}</p>}
              </div>

              {saveError && <ErrorNote>{saveError}</ErrorNote>}

              <div className="grid grid-cols-2 gap-2 pt-1">
                <button className="btn btn-primary" disabled={busy} onClick={() => save("paid")}>
                  <Icon name="cash" size={18} />
                  Save as paid
                </button>
                <button className="btn btn-credit" disabled={busy} onClick={() => save("credit")}>
                  <Icon name="clock" size={18} />
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
