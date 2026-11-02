"use client";

import type { DateRange, RangePreset } from "@/lib/format";
import type { SaleStatus } from "@/lib/types";

export function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "brand" | "credit";
}) {
  const color = tone === "brand" ? "text-brand" : tone === "credit" ? "text-credit" : "text-ink";
  return (
    <div className="card min-w-0 px-3 py-2.5 sm:px-4 sm:py-3">
      <div className="truncate text-xs font-medium text-muted sm:text-[13px]">{label}</div>
      <div className={`money mt-0.5 truncate text-lg font-bold sm:text-2xl ${color}`}>{value}</div>
    </div>
  );
}

const statusStyles: Record<SaleStatus, { label: string; className: string }> = {
  paid: { label: "Paid", className: "bg-brand-soft text-brand-dark" },
  partial: { label: "Part paid", className: "bg-credit-soft text-credit-dark" },
  credit: { label: "Credit", className: "bg-credit-soft text-credit-dark" },
};

export function StatusBadge({ status }: { status: SaleStatus }) {
  const style = statusStyles[status];
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${style.className}`}>
      {style.label}
    </span>
  );
}

export function ErrorNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg bg-danger-soft p-3 text-sm text-danger" role="alert">
      {children}
    </p>
  );
}

export function EmptyNote({ children }: { children: React.ReactNode }) {
  return <div className="card p-8 text-center text-sm text-muted">{children}</div>;
}

export function PageTitle({ children }: { children: React.ReactNode }) {
  return <h1 className="mb-4 text-xl font-bold tracking-tight sm:text-2xl">{children}</h1>;
}

const presets: { value: RangePreset; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "week", label: "7 days" },
  { value: "month", label: "This month" },
  { value: "custom", label: "Custom" },
];

export function RangePicker({
  value,
  onChange,
}: {
  value: DateRange;
  onChange: (next: DateRange) => void;
}) {
  return (
    <div>
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
        {presets.map((preset) => {
          const active = value.preset === preset.value;
          return (
            <button
              key={preset.value}
              type="button"
              aria-pressed={active}
              onClick={() => onChange({ ...value, preset: preset.value })}
              className={`min-h-10 shrink-0 cursor-pointer rounded-full border px-4 text-sm font-medium ${
                active ? "border-ink bg-ink text-white" : "border-[#c6cbbf] bg-surface text-ink"
              }`}
            >
              {preset.label}
            </button>
          );
        })}
      </div>
      {value.preset === "custom" && (
        <div className="mt-3 grid grid-cols-2 gap-3 sm:max-w-md">
          <div>
            <label className="label" htmlFor="range-from">From</label>
            <input
              id="range-from"
              type="date"
              className="field"
              value={value.from}
              onChange={(e) => onChange({ ...value, from: e.target.value })}
            />
          </div>
          <div>
            <label className="label" htmlFor="range-to">To</label>
            <input
              id="range-to"
              type="date"
              className="field"
              value={value.to}
              onChange={(e) => onChange({ ...value, to: e.target.value })}
            />
          </div>
        </div>
      )}
    </div>
  );
}
