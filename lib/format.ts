const currency = process.env.NEXT_PUBLIC_CURRENCY || "KSh";

const amount = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

export function money(value: number) {
  return `${currency} ${amount.format(value)}`;
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
