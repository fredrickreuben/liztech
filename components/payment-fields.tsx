"use client";

import { useId } from "react";
import { Icon, type IconName } from "@/components/ui";
import { methodLabel, money } from "@/lib/format";
import type { PaymentMethod } from "@/lib/types";

export type PaymentChoice = PaymentMethod | "split";

export type PaymentDraft = {
  choice: PaymentChoice;
  amount: string;
  cash: string;
  mpesa: string;
};

export type PaymentLine = { method: PaymentMethod; amount: number };

export const emptyPayment: PaymentDraft = { choice: "cash", amount: "", cash: "", mpesa: "" };

const choices: { value: PaymentChoice; label: string; icon: IconName }[] = [
  { value: "cash", label: "Cash", icon: "cash" },
  { value: "mpesa", label: "M-PESA", icon: "mobile" },
  { value: "split", label: "Split", icon: "split" },
];

function parseAmount(text: string) {
  const value = Number(text || 0);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

// Reads the form into payment lines, or null if an amount is not a valid number.
// fixedAmount is for one-method payments of a known sum, such as a fully paid sale.
export function paymentLines(draft: PaymentDraft, fixedAmount?: number): PaymentLine[] | null {
  if (draft.choice === "split") {
    const cash = parseAmount(draft.cash);
    const mpesa = parseAmount(draft.mpesa);
    if (cash === null || mpesa === null) return null;
    const lines: PaymentLine[] = [
      { method: "cash", amount: cash },
      { method: "mpesa", amount: mpesa },
    ];
    return lines.filter((line) => line.amount > 0);
  }
  const amount = fixedAmount ?? parseAmount(draft.amount);
  if (amount === null) return null;
  return amount > 0 ? [{ method: draft.choice, amount }] : [];
}

export function linesTotal(lines: PaymentLine[]) {
  return lines.reduce((sum, line) => sum + line.amount, 0);
}

export function describePayments(lines: PaymentLine[]) {
  return lines.map((line) => `${methodLabel(line.method)} ${money(line.amount)}`).join(" + ");
}

export function PaymentFields({
  value,
  onChange,
  amountLabel,
  amountHint,
  amountAction,
  target,
  invalid = false,
}: {
  value: PaymentDraft;
  onChange: (next: PaymentDraft) => void;
  amountLabel: string;
  amountHint?: string;
  amountAction?: React.ReactNode;
  // The sum a split is working towards, used to show what is left to allocate.
  target?: number;
  invalid?: boolean;
}) {
  const id = useId();
  const splitTotal = (parseAmount(value.cash) ?? 0) + (parseAmount(value.mpesa) ?? 0);
  const left = target === undefined ? null : target - splitTotal;

  return (
    <div className="space-y-3">
      <div>
        <span className="label" id={`${id}-method`}>Payment method</span>
        <div className="grid grid-cols-3 gap-1 rounded-xl bg-paper p-1" role="group" aria-labelledby={`${id}-method`}>
          {choices.map((choice) => {
            const active = value.choice === choice.value;
            return (
              <button
                key={choice.value}
                type="button"
                aria-pressed={active}
                onClick={() => onChange({ ...value, choice: choice.value })}
                className={`flex min-h-10 cursor-pointer items-center justify-center gap-1.5 rounded-lg text-sm font-semibold transition-colors ${
                  active ? "bg-navy text-white" : "text-ink hover:bg-surface"
                }`}
              >
                <Icon name={choice.icon} size={16} />
                {choice.label}
              </button>
            );
          })}
        </div>
      </div>

      {value.choice === "split" ? (
        <div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label" htmlFor={`${id}-cash`}>Cash amount</label>
              <input
                id={`${id}-cash`}
                className="field money"
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                placeholder="0"
                value={value.cash}
                onChange={(e) => onChange({ ...value, cash: e.target.value })}
                aria-invalid={invalid}
              />
            </div>
            <div>
              <label className="label" htmlFor={`${id}-mpesa`}>M-PESA amount</label>
              <input
                id={`${id}-mpesa`}
                className="field money"
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                placeholder="0"
                value={value.mpesa}
                onChange={(e) => onChange({ ...value, mpesa: e.target.value })}
                aria-invalid={invalid}
              />
            </div>
          </div>
          {left !== null && (
            <p className={`money mt-1 text-xs font-medium ${Math.abs(left) < 0.005 ? "text-brand" : left < 0 ? "text-danger" : "text-muted"}`}>
              {Math.abs(left) < 0.005
                ? "Split matches the total"
                : left > 0
                  ? `${money(left)} left of ${money(target as number)}`
                  : `${money(-left)} more than ${money(target as number)}`}
            </p>
          )}
        </div>
      ) : (
        <div>
          <label className="label" htmlFor={`${id}-amount`}>
            {amountLabel} {amountHint && <span className="font-normal text-muted">{amountHint}</span>}
          </label>
          <div className="flex gap-2">
            <input
              id={`${id}-amount`}
              className="field money min-w-0 flex-1"
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              placeholder="0"
              value={value.amount}
              onChange={(e) => onChange({ ...value, amount: e.target.value })}
              aria-invalid={invalid}
            />
            {amountAction}
          </div>
        </div>
      )}
    </div>
  );
}
