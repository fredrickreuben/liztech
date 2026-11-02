"use client";

import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Banknote,
  BookOpenText,
  ChartColumn,
  Check,
  ChevronDown,
  CircleAlert,
  Clock,
  KeyRound,
  Lock,
  LogOut,
  Mail,
  Minus,
  Phone,
  Plus,
  ReceiptText,
  Search,
  ShieldCheck,
  ShoppingCart,
  Tag,
  TrendingUp,
  UserPlus,
  UserRound,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { money, type DateRange, type RangePreset } from "@/lib/format";
import type { SaleStatus } from "@/lib/types";

const icons = {
  sell: ShoppingCart,
  sales: ReceiptText,
  clients: Users,
  analytics: TrendingUp,
  admin: ShieldCheck,
  logout: LogOut,
  wallet: Wallet,
  clock: Clock,
  total: ChartColumn,
  check: Check,
  phone: Phone,
  user: UserRound,
  chevron: ChevronDown,
  arrow: ArrowRight,
  plus: Plus,
  minus: Minus,
  remove: X,
  search: Search,
  mail: Mail,
  lock: Lock,
  alert: CircleAlert,
  services: Tag,
  addUser: UserPlus,
  cash: Banknote,
  key: KeyRound,
  up: ArrowUp,
  down: ArrowDown,
  ledger: BookOpenText,
};

export type IconName = keyof typeof icons;

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  const Glyph = icons[name];
  return <Glyph size={size} strokeWidth={1.8} aria-hidden="true" className="shrink-0" />;
}

// A text field with an icon inside its left edge.
export function IconField({
  icon,
  ...props
}: { icon: IconName } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="relative w-full">
      <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted">
        <Icon name={icon} size={18} />
      </span>
      <input {...props} className={`field !pl-10 ${props.className ?? ""}`} />
    </div>
  );
}

export function Logo({ size = 36 }: { size?: number }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-xl font-bold text-navy"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.42,
        background: "linear-gradient(135deg, var(--color-gold), var(--color-mint))",
      }}
      aria-hidden="true"
    >
      LC
    </span>
  );
}

// Eases a number towards its target so totals visibly tick up when they change.
export function useCountUp(target: number, duration = 700) {
  const [value, setValue] = useState(0);
  const from = useRef(0);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const start = from.current;
    const began = performance.now();
    let frame = requestAnimationFrame(function tick(now) {
      const progress = reduced ? 1 : Math.min((now - began) / duration, 1);
      const eased = 1 - (1 - progress) ** 3;
      const next = start + (target - start) * eased;
      from.current = next;
      setValue(next);
      if (progress < 1) frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [target, duration]);

  return value;
}

export function CountUpMoney({ value }: { value: number }) {
  const shown = useCountUp(value);
  return <>{money(Math.abs(shown - value) < 0.005 ? value : Math.round(shown))}</>;
}

export function Delta({
  change,
  goodWhenUp = true,
  onDark = false,
  emptyLabel,
  suffix,
}: {
  change: number | null;
  goodWhenUp?: boolean;
  onDark?: boolean;
  emptyLabel: string;
  suffix: string;
}) {
  if (change === null) {
    return <span className={`text-xs ${onDark ? "text-white/70" : "text-muted"}`}>{emptyLabel}</span>;
  }
  const rounded = Math.round(Math.abs(change));
  const up = change >= 0;
  const good = rounded === 0 || up === goodWhenUp;
  const color = onDark
    ? good ? "bg-mint/20 text-mint" : "bg-red-400/20 text-red-200"
    : good ? "bg-brand-soft text-brand-dark" : "bg-danger-soft text-danger";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${color}`}>
      <Icon name={up ? "up" : "down"} size={12} />
      {rounded}% <span className="font-normal opacity-85">{suffix}</span>
    </span>
  );
}

const tones = {
  brand: { icon: "bg-brand-soft text-brand-dark" },
  credit: { icon: "bg-credit-soft text-credit-dark" },
  navy: { icon: "bg-navy-soft text-navy" },
  danger: { icon: "bg-danger-soft text-danger" },
};

export function Stat({
  label,
  value,
  tone = "navy",
  icon,
  footer,
}: {
  label: string;
  value: string;
  tone?: keyof typeof tones;
  icon?: IconName;
  footer?: React.ReactNode;
}) {
  return (
    <div className="card min-w-0 p-3 sm:p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="truncate text-xs font-medium text-muted sm:text-[13px]">{label}</div>
        {icon && (
          <span className={`hidden size-8 items-center justify-center rounded-lg sm:flex ${tones[tone].icon}`}>
            <Icon name={icon} size={17} />
          </span>
        )}
      </div>
      <div className="money mt-1 truncate text-lg font-bold sm:text-2xl">{value}</div>
      {footer && <div className="mt-1.5">{footer}</div>}
    </div>
  );
}

const statusStyles: Record<SaleStatus, { label: string; className: string; dot: string }> = {
  paid: { label: "Paid", className: "bg-brand-soft text-brand-dark", dot: "bg-brand" },
  partial: { label: "Part paid", className: "bg-credit-soft text-credit-dark", dot: "bg-gold" },
  credit: { label: "Credit", className: "bg-credit-soft text-credit-dark", dot: "bg-credit" },
};

export function StatusBadge({ status }: { status: SaleStatus }) {
  const style = statusStyles[status];
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${style.className}`}>
      <span className={`size-1.5 rounded-full ${style.dot}`} />
      {style.label}
    </span>
  );
}

export function Avatar({ name, size = 38 }: { name: string; size?: number }) {
  const parts = name.trim().split(/\s+/);
  const initials = ((parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "")).toUpperCase();
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-navy-soft font-semibold text-navy"
      style={{ width: size, height: size, fontSize: size * 0.36 }}
      aria-hidden="true"
    >
      {initials}
    </span>
  );
}

export function Sparkline({ values, label }: { values: number[]; label: string }) {
  const gradient = useId();
  if (values.length < 2) return null;
  const max = Math.max(...values, 1);
  const points = values.map((value, index) => [
    (index / (values.length - 1)) * 100,
    34 - (value / max) * 30,
  ]);
  const line = points.map(([x, y]) => `${x},${y}`).join(" ");
  const [lastX, lastY] = points[points.length - 1];
  return (
    <svg viewBox="-2 0 104 38" className="h-14 w-full" role="img" aria-label={label} preserveAspectRatio="none">
      <defs>
        <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--color-mint)" stopOpacity="0.35" />
          <stop offset="100%" stopColor="var(--color-mint)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,38 ${line} 100,38`} fill={`url(#${gradient})`} />
      <polyline points={line} fill="none" stroke="var(--color-mint)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      <circle cx={lastX} cy={lastY} r="1.6" fill="var(--color-mint)" />
    </svg>
  );
}

export function ErrorNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-2 rounded-lg bg-danger-soft p-3 text-sm text-danger" role="alert">
      <Icon name="alert" size={18} />
      <span>{children}</span>
    </p>
  );
}

export function EmptyNote({ children }: { children: React.ReactNode }) {
  return <div className="card p-8 text-center text-sm text-muted">{children}</div>;
}

export function PageTitle({ children, subtitle }: { children: React.ReactNode; subtitle?: string }) {
  return (
    <div className="mb-4">
      <h1 className="text-xl font-bold tracking-tight sm:text-2xl">{children}</h1>
      {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
    </div>
  );
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
              className={`min-h-10 shrink-0 cursor-pointer rounded-full border px-4 text-sm font-medium transition-colors ${
                active ? "border-navy bg-navy text-white" : "border-[#c3ccd9] bg-surface text-ink hover:border-navy"
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
