"use client";

import { useEffect, useState } from "react";
import { Avatar, Delta, EmptyNote, ErrorNote, PageTitle, RangePicker, Stat } from "@/components/ui";
import { browserTimeZone, money, percentChange, previousBounds, rangeBounds, shortDay, type DateRange } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import type { Analytics, ClientBalance } from "@/lib/types";

const SERIES = [
  { key: "sales", label: "Sold", color: "#2563eb" },
  { key: "collected", label: "Received", color: "#059669" },
] as const;

// Rounds up to a clean axis maximum: 1, 2, 2.5 or 5 times a power of ten.
function niceMax(value: number) {
  if (value <= 0) return 1;
  const power = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 2.5, 5, 10].find((candidate) => candidate * power >= value) ?? 10;
  return step * power;
}

function axisLabel(value: number) {
  return new Intl.NumberFormat("en-US", {
    notation: value >= 10000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(value);
}

function TrendChart({ days }: { days: Analytics["by_day"] }) {
  const [active, setActive] = useState<number | null>(null);
  const max = niceMax(Math.max(...days.flatMap((day) => [day.sales, day.collected])));
  const last = days.length - 1;
  const x = (index: number) => (index / last) * 100;
  const y = (value: number) => 100 - (value / max) * 100;
  const shown = active === null ? null : days[active];

  function pointAt(event: React.PointerEvent<HTMLDivElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    const ratio = Math.min(Math.max((event.clientX - box.left) / box.width, 0), 1);
    setActive(Math.round(ratio * last));
  }

  return (
    <section className="card p-4">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <h2 className="font-bold">Sold and received per day</h2>
        <ul className="flex gap-4 text-xs font-medium">
          {SERIES.map((series) => (
            <li key={series.key} className="flex items-center gap-1.5">
              <span className="h-0.5 w-4 rounded-full" style={{ background: series.color }} />
              {series.label}
            </li>
          ))}
        </ul>
      </div>
      {/* The readout acts as the tooltip, so it also works by touch on a phone. */}
      <p className="money mt-1 min-h-5 text-sm text-muted" aria-live="polite">
        {shown
          ? `${shortDay(shown.day)}: ${money(shown.sales)} sold, ${money(shown.collected)} received`
          : "Tap or hover over the chart for details"}
      </p>

      <div className="mt-3 flex gap-2">
        <div className="money flex h-52 flex-col justify-between text-right text-[11px] text-muted" aria-hidden="true">
          <span>{axisLabel(max)}</span>
          <span>{axisLabel(max / 2)}</span>
          <span>0</span>
        </div>
        <div className="min-w-0 flex-1">
          <div
            className="relative h-52 touch-pan-y border-b border-line"
            style={{ backgroundImage: "linear-gradient(var(--color-line) 1px, transparent 1px)", backgroundSize: "100% 50%" }}
            onPointerMove={pointAt}
            onPointerDown={pointAt}
            onPointerLeave={(event) => {
              if (event.pointerType === "mouse") setActive(null);
            }}
          >
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible" aria-hidden="true">
              {SERIES.map((series) => {
                const line = days.map((day, index) => `${x(index)},${y(day[series.key])}`).join(" ");
                return (
                  <g key={series.key}>
                    <polygon points={`0,100 ${line} 100,100`} fill={series.color} opacity="0.1" />
                    <polyline points={line} fill="none" stroke={series.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                  </g>
                );
              })}
            </svg>
            {shown && active !== null && (
              <>
                <span className="pointer-events-none absolute inset-y-0 w-px bg-muted/50" style={{ left: `${x(active)}%` }} />
                {SERIES.map((series) => (
                  <span
                    key={series.key}
                    className="pointer-events-none absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-surface"
                    style={{ left: `${x(active)}%`, top: `${y(shown[series.key])}%`, background: series.color }}
                  />
                ))}
              </>
            )}
          </div>
          <div className="mt-1 flex justify-between text-[11px] text-muted">
            <span>{shortDay(days[0].day)}</span>
            <span>{shortDay(days[last].day)}</span>
          </div>
        </div>
      </div>

      <details className="mt-3 text-sm">
        <summary className="cursor-pointer font-medium text-muted">Show as table</summary>
        <div className="mt-2 max-h-64 overflow-y-auto">
          <table className="money w-full text-left">
            <thead className="text-xs text-muted">
              <tr>
                <th className="py-1 font-medium">Day</th>
                <th className="py-1 text-right font-medium">Sold</th>
                <th className="py-1 text-right font-medium">Received</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {days.map((day) => (
                <tr key={day.day}>
                  <td className="py-1">{shortDay(day.day)}</td>
                  <td className="py-1 text-right">{money(day.sales)}</td>
                  <td className="py-1 text-right">{money(day.collected)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}

function RankedBars({
  title,
  rows,
}: {
  title: string;
  rows: { key: string; label: string; value: number; detail: string }[];
}) {
  const max = Math.max(...rows.map((row) => row.value), 1);
  return (
    <section className="card p-4">
      <h2 className="font-bold">{title}</h2>
      <ul className="mt-3 space-y-3">
        {rows.map((row) => (
          <li key={row.key}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 truncate font-medium">{row.label}</span>
              <span className="money shrink-0 font-semibold">{money(row.value)}</span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-r bg-paper">
              <div className="h-full rounded-r bg-[#2563eb] transition-[width] duration-500" style={{ width: `${(row.value / max) * 100}%` }} />
            </div>
            <div className="money mt-0.5 text-xs text-muted">{row.detail}</div>
          </li>
        ))}
      </ul>
    </section>
  );
}

// How long credit has been unpaid. Older debt is harder to recover, so it is flagged redder.
function CreditAging({ buckets, debtors }: { buckets: { label: string; amount: number; color: string }[]; debtors: ClientBalance[] }) {
  const total = buckets.reduce((sum, bucket) => sum + bucket.amount, 0);
  return (
    <section className="card p-4">
      <h2 className="font-bold">Unpaid credit by age</h2>
      {total === 0 ? (
        <p className="mt-3 text-sm text-muted">No unpaid credit.</p>
      ) : (
        <>
          <div className="mt-3 flex h-3 gap-0.5 overflow-hidden rounded-full">
            {buckets.filter((bucket) => bucket.amount > 0).map((bucket) => (
              <span key={bucket.label} style={{ width: `${(bucket.amount / total) * 100}%`, background: bucket.color }} />
            ))}
          </div>
          <ul className="mt-3 space-y-1.5 text-sm">
            {buckets.map((bucket) => (
              <li key={bucket.label} className="flex items-center gap-2">
                <span className="size-2.5 shrink-0 rounded-sm" style={{ background: bucket.color }} />
                <span>{bucket.label}</span>
                <span className="leader" />
                <span className="money font-semibold">{money(bucket.amount)}</span>
              </li>
            ))}
          </ul>
          <h3 className="mb-1 mt-4 text-xs font-semibold uppercase tracking-wide text-muted">Who owes the most</h3>
          <ul className="divide-y divide-line">
            {debtors.map((client) => (
              <li key={client.id} className="flex items-center gap-2.5 py-2 text-sm">
                <Avatar name={client.name} size={30} />
                <span className="min-w-0 flex-1 truncate font-medium">{client.name}</span>
                <span className="money shrink-0 font-semibold text-credit">{money(client.balance)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

export default function AnalyticsPage() {
  const [range, setRange] = useState<DateRange>({ preset: "week", from: "", to: "" });
  const [data, setData] = useState<Analytics | null>(null);
  const [previous, setPrevious] = useState<Analytics | null>(null);
  const [aging, setAging] = useState({ fresh: 0, month: 0, old: 0 });
  const [debtors, setDebtors] = useState<ClientBalance[]>([]);
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

  useEffect(() => {
    let active = true;
    Promise.all([
      supabase.from("sales").select("balance, created_at").gt("balance", 0).limit(1000),
      supabase.from("client_balances").select("*").gt("balance", 0).order("balance", { ascending: false }).limit(5),
    ]).then(([open, top]) => {
      if (!active) return;
      const now = Date.now();
      const next = { fresh: 0, month: 0, old: 0 };
      for (const sale of open.data ?? []) {
        const days = (now - new Date(sale.created_at).getTime()) / 86400000;
        if (days <= 7) next.fresh += sale.balance;
        else if (days <= 30) next.month += sale.balance;
        else next.old += sale.balance;
      }
      setAging(next);
      setDebtors((top.data as ClientBalance[]) ?? []);
    });
    return () => {
      active = false;
    };
  }, []);

  const paidShare = data && data.sales_total > 0
    ? Math.round(((data.sales_total - data.credit_given) / data.sales_total) * 100)
    : null;

  return (
    <div className="space-y-4">
      <PageTitle subtitle="How the business is doing, compared with the period before.">Analytics</PageTitle>
      <RangePicker value={range} onChange={setRange} />
      {error && <ErrorNote>{error}</ErrorNote>}
      {!data && !error && <p className="text-sm text-muted">Loading…</p>}

      {data && (
        <>
          <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
            <Stat
              label="Total sales"
              value={money(data.sales_total)}
              icon="total"
              footer={<Delta change={previous ? percentChange(data.sales_total, previous.sales_total) : null} suffix="vs before" emptyLabel="Nothing to compare" />}
            />
            <Stat
              label="Money received"
              value={money(data.collected)}
              icon="wallet"
              tone="brand"
              footer={<Delta change={previous ? percentChange(data.collected, previous.collected) : null} suffix="vs before" emptyLabel="Nothing to compare" />}
            />
            <Stat
              label="Unpaid from this period"
              value={money(data.credit_given)}
              icon="clock"
              tone="credit"
              footer={<span className="text-xs text-muted">{paidShare === null ? "No sales yet" : `${paidShare}% of sales paid`}</span>}
            />
            <Stat
              label="Owed by all clients"
              value={money(data.outstanding)}
              icon="clients"
              tone="credit"
              footer={<span className="text-xs text-muted">{data.sale_count} {data.sale_count === 1 ? "sale" : "sales"} in this period</span>}
            />
          </div>

          <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
            <Stat label="Received in cash" value={money(data.by_method.cash)} icon="cash" tone="brand" />
            <Stat label="Received by M-PESA" value={money(data.by_method.mpesa)} icon="mobile" tone="brand" />
            <Stat label="Expenses" value={money(data.expenses_total)} icon="expenses" tone="danger" />
            <Stat
              label="Received less expenses"
              value={money(data.collected - data.expenses_total)}
              icon="wallet"
              tone={data.collected - data.expenses_total < 0 ? "danger" : "brand"}
            />
          </div>
          {data.by_method.unspecified > 0 && (
            <p className="money text-xs text-muted">
              {money(data.by_method.unspecified)} was received before payment methods were recorded.
            </p>
          )}

          {data.sale_count === 0 && <EmptyNote>No sales in this period.</EmptyNote>}
          {data.sale_count > 0 && data.by_day.length > 1 && <TrendChart days={data.by_day} />}

          <div className="grid gap-4 lg:grid-cols-3 lg:items-start">
            {data.sale_count > 0 && (
              <>
                <RankedBars
                  title="Top services"
                  rows={data.top_services.map((service) => ({
                    key: service.name,
                    label: service.name,
                    value: service.revenue,
                    detail: `${service.quantity} sold`,
                  }))}
                />
                <RankedBars
                  title="Sales by staff"
                  rows={data.by_staff.map((person) => ({
                    key: person.username,
                    label: person.username,
                    value: person.sales,
                    detail: `${person.sale_count} ${person.sale_count === 1 ? "sale" : "sales"}`,
                  }))}
                />
              </>
            )}
            <CreditAging
              debtors={debtors}
              buckets={[
                { label: "Up to 7 days", amount: aging.fresh, color: "var(--color-gold)" },
                { label: "8 to 30 days", amount: aging.month, color: "var(--color-credit)" },
                { label: "Over 30 days", amount: aging.old, color: "var(--color-danger)" },
              ]}
            />
          </div>
        </>
      )}
    </div>
  );
}
