// Date helpers. Dates are plain strings: days 'YYYY-MM-DD', months 'YYYY-MM'.
// Keeping them as strings avoids timezone drift between server (UTC) and you (local).

export type ISODate = string; // YYYY-MM-DD
export type MonthKey = string; // YYYY-MM

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function todayISO(tz: string): ISODate {
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}

export const monthOf = (d: ISODate): MonthKey => d.slice(0, 7);
export const dayOf = (d: ISODate) => Number(d.slice(8, 10));

export function isMonthKey(s: unknown): s is MonthKey {
  return typeof s === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
}
export function isISODate(s: unknown): s is ISODate {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

export function daysInMonth(m: MonthKey) {
  const [y, mo] = m.split("-").map(Number);
  return new Date(Date.UTC(y, mo, 0)).getUTCDate();
}

export function addMonths(m: MonthKey, n: number): MonthKey {
  const [y, mo] = m.split("-").map(Number);
  const d = new Date(Date.UTC(y, mo - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export const firstDay = (m: MonthKey): ISODate => `${m}-01`;
export const lastDay = (m: MonthKey): ISODate => `${m}-${String(daysInMonth(m)).padStart(2, "0")}`;

export function monthName(m: MonthKey) {
  return MONTHS[Number(m.slice(5, 7)) - 1];
}
export function monthShort(m: MonthKey) {
  return monthName(m).slice(0, 3);
}
export function monthYear(m: MonthKey) {
  return m.slice(0, 4);
}

/** 'Sep 29' */
export function fmtDay(d: ISODate) {
  return `${monthShort(monthOf(d))} ${dayOf(d)}`;
}

/** Shift an ISO date by n days. */
export function addDays(d: ISODate, n: number): ISODate {
  const [y, m, day] = d.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, day + n));
  return t.toISOString().slice(0, 10);
}
