"use client";

import { Delta, Icon, type IconName } from "@/components/ui";
import { money, percentChange } from "@/lib/format";
import type { Analytics } from "@/lib/types";

function Figure({
  label,
  caption,
  value,
  icon,
  color = "text-white",
  footer,
}: {
  label: string;
  caption: string;
  value: number;
  icon: IconName;
  color?: string;
  footer?: React.ReactNode;
}) {
  return (
    <div className="min-w-0 rounded-xl bg-white/8 p-3">
      <div className="flex items-center gap-1.5 text-sm font-semibold">
        <Icon name={icon} size={16} />
        {label}
      </div>
      <div className={`money mt-1 truncate text-lg font-bold sm:text-xl ${color}`}>{money(value)}</div>
      <div className="mt-0.5 text-xs text-white/65">{caption}</div>
      {footer && <div className="mt-1.5">{footer}</div>}
    </div>
  );
}

// Revenue counts what was sold, including credit. Income counts only money received.
export function FinanceSummary({ data, previous }: { data: Analytics; previous: Analytics | null }) {
  const profit = data.sales_total - data.expenses_total;
  const balance = data.collected - data.expenses_total;
  const change = (now: number, before?: number) => (before === undefined ? null : percentChange(now, before));

  return (
    <section className="hero rise p-3 sm:p-4" aria-label="Financial summary">
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
        <Figure
          label="Revenue"
          caption="Total sold, including credit"
          value={data.sales_total}
          icon="total"
          footer={<Delta change={change(data.sales_total, previous?.sales_total)} onDark suffix="vs before" emptyLabel="Nothing to compare" />}
        />
        <Figure
          label="Income"
          caption="Money actually received"
          value={data.collected}
          icon="wallet"
          color="text-mint"
          footer={<Delta change={change(data.collected, previous?.collected)} onDark suffix="vs before" emptyLabel="Nothing to compare" />}
        />
        <Figure
          label="Expenses"
          caption="Money spent"
          value={data.expenses_total}
          icon="expenses"
          color="text-gold"
          footer={<Delta change={change(data.expenses_total, previous?.expenses_total)} goodWhenUp={false} onDark suffix="vs before" emptyLabel="Nothing to compare" />}
        />
        <Figure
          label={profit < 0 ? "Loss" : "Profit"}
          caption="Revenue less expenses"
          value={profit}
          icon="profit"
          color={profit < 0 ? "text-red-200" : "text-mint"}
        />
        <div className="col-span-2 lg:col-span-1">
          <Figure
            label="Balance"
            caption="Income less expenses"
            value={balance}
            icon="scale"
            color={balance < 0 ? "text-red-200" : "text-white"}
            footer={<span className="money text-xs text-white/65">All time: {money(data.all_time_balance)}</span>}
          />
        </div>
      </div>
    </section>
  );
}
