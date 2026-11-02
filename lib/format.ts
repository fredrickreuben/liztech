const currency = process.env.NEXT_PUBLIC_CURRENCY || "KSh";

const amount = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

export function money(value: number) {
  return `${currency} ${amount.format(value)}`;
}

export const frequencyLabels = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  yearly: "Yearly",
} as const;

// The device's local date as yyyy-mm-dd, the format of due dates.
export function localDay(date = new Date()) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

// Whole days from today to a yyyy-mm-dd date. Negative means it has passed.
export function daysUntil(day: string, today: string) {
  const toUtc = (text: string) => {
    const [year, month, date] = text.split("-").map(Number);
    return Date.UTC(year, month - 1, date);
  };
  return Math.round((toUtc(day) - toUtc(today)) / 86400000);
}

export function methodLabel(method: string | null) {
  if (method === "cash") return "Cash";
  if (method === "mpesa") return "M-PESA";
  return "Not recorded";
}

export function dateTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function shortDay(day: string) {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(year, month - 1, date).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
}

export function browserTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

export type RangePreset = "today" | "yesterday" | "week" | "month" | "custom";

export type DateRange = {
  preset: RangePreset;
  // yyyy-mm-dd, used only by the custom preset
  from: string;
  to: string;
};

function atDayStart(date: Date, offsetDays = 0) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + offsetDays);
}

function parseDay(day: string) {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(year, month - 1, date);
}

export function timeOnly(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

// The equal-length period directly before the given bounds, for comparisons.
export function previousBounds(bounds: { from: string; to: string }) {
  const start = new Date(bounds.from).getTime();
  const end = new Date(bounds.to).getTime();
  return { from: new Date(start - (end - start)).toISOString(), to: bounds.from };
}

// Percentage change, or null when there is nothing to compare against.
export function percentChange(current: number, previous: number) {
  if (previous <= 0) return null;
  return ((current - previous) / previous) * 100;
}

// Turns a range into the half-open [from, to) instants the database expects,
// using the device's local day boundaries.
export function rangeBounds(range: DateRange) {
  const now = new Date();
  const today = atDayStart(now);
  let from = today;
  let to = atDayStart(now, 1);

  if (range.preset === "yesterday") {
    from = atDayStart(now, -1);
    to = today;
  } else if (range.preset === "week") {
    from = atDayStart(now, -6);
  } else if (range.preset === "month") {
    from = new Date(now.getFullYear(), now.getMonth(), 1);
  } else if (range.preset === "custom" && range.from && range.to) {
    const start = parseDay(range.from);
    const end = parseDay(range.to);
    const [first, last] = start <= end ? [start, end] : [end, start];
    from = first;
    to = atDayStart(last, 1);
  }

  return { from: from.toISOString(), to: to.toISOString() };
}
