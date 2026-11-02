"use client";

import { useEffect, useState } from "react";
import { EmptyNote, ErrorNote, PageTitle, RangePicker, Stat } from "@/components/ui";
import { browserTimeZone, money, rangeBounds, shortDay, type DateRange } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import type { Analytics } from "@/lib/types";

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

function DailySalesChart({ days }: { days: Analytics["by_day"] }) {
  const [active, setActive] = useState<number | null>(null);
  const max = niceMax(Math.max(...days.map((day) => day.sales)));
  const shown = active === null ? null : days[active];

  return (
    <section className="card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <h2 className="font-bold">Sales per day</h2>
        {/* Doubles as the tooltip, so it also works by touch on a phone. */}
        <p className="money min-h-5 text-sm text-muted" aria-live="polite">
          {shown ? `${shortDay(shown.day)}: ${money(shown.sales)} sold, ${money(shown.collected)} received` : "Tap a bar for details"}
        </p>
      </div>

      <div className="mt-4 flex gap-2">
        <div className="money flex h-44 flex-col justify-between text-right text-[11px] text-muted" aria-hidden="true">
          <span>{axisLabel(max)}</span>
          <span>{axisLabel(max / 2)}</span>
          <span>0</span>
        </div>
        <div className="min-w-0 flex-1">
          <div
            className="relative flex h-44 items-end gap-0.5 border-b border-line"
            style={{ backgroundImage: "linear-gradient(var(--color-line) 1px, transparent 1px)", backgroundSize: "100% 50%" }}
            onMouseLeave={() => setActive(null)}
          >
            {days.map((day, index) => (
              <button
                key={day.day}
                type="button"
                aria-label={`${shortDay(day.day)}: ${money(day.sales)} sold, ${money(day.collected)} received`}
                className="flex h-full min-w-0 flex-1 cursor-pointer items-end justify-center"
                onMouseEnter={() => setActive(index)}
                onFocus={() => setActive(index)}
                onClick={() => setActive(index)}
              >
                <span
                  className={`block w-full max-w-6 rounded-t ${active === index ? "bg-brand-dark" : "bg-brand"}`}
                  style={{ height: `${(day.sales / max) * 100}%` }}
                />
              </button>
            ))}
          </div>
          <div className="mt-1 flex justify-between text-[11px] text-muted">
            <span>{shortDay(days[0].day)}</span>
            <span>{shortDay(days[days.length - 1].day)}</span>
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
              <div className="h-full rounded-r bg-brand" style={{ width: `${(row.value / max) * 100}%` }} />
            </div>
            <div className="money mt-0.5 text-xs text-muted">{row.detail}</div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function AnalyticsPage() {
  const [range, setRange] = useState<DateRange>({ preset: "week", from: "", to: "" });
  const [data, setData] = useState<Analytics | null>(null);
  const [error, setError] = useState("");

  const incompleteCustom = range.preset === "custom" && (!range.from || !range.to);

  useEffect(() => {
    if (incompleteCustom) return;
    let active = true;
    const { from, to } = rangeBounds(range);
    supabase
      .rpc("analytics", { p_from: from, p_to: to, p_tz: browserTimeZone() })
      .then(({ data: result, error: rpcError }) => {
        if (!active) return;
        if (rpcError) setError(rpcError.message);
        else {
          setError("");
          setData(result as Analytics);
        }
      });
    return () => {
      active = false;
    };
  }, [range, incompleteCustom]);

  return (
    <div className="space-y-4">
      <PageTitle>Analytics</PageTitle>
      <RangePicker value={range} onChange={setRange} />
      {error && <ErrorNote>{error}</ErrorNote>}
      {!data && !error && <p className="text-sm text-muted">Loading…</p>}

      {data && (
        <>
          <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
            <Stat label="Total sales" value={money(data.sales_total)} />
            <Stat label="Money received" value={money(data.collected)} tone="brand" />
            <Stat label="Unpaid from this period" value={money(data.credit_given)} tone="credit" />
            <Stat label="Owed by all clients" value={money(data.outstanding)} tone="credit" />
          </div>

          {data.sale_count === 0 ? (
            <EmptyNote>No sales in this period.</EmptyNote>
          ) : (
            <>
              {data.by_day.length > 1 && <DailySalesChart days={data.by_day} />}
              <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
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
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
