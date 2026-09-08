const TIME_ZONE = "Asia/Seoul";

const dateTime = new Intl.DateTimeFormat("ko-KR", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const partyDate = new Intl.DateTimeFormat("ko-KR", {
  timeZone: TIME_ZONE,
  month: "long",
  day: "numeric",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const clockTime = new Intl.DateTimeFormat("ko-KR", {
  timeZone: TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  hour12: true,
});

const dayLabel = new Intl.DateTimeFormat("ko-KR", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "long",
  day: "numeric",
  weekday: "short",
});

const dateOnly = new Intl.DateTimeFormat("ko-KR", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "numeric",
  day: "numeric",
});

function toDate(value: string | number | Date): Date | null {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDateTime(value: string | number | Date): string {
  const date = toDate(value);
  return date ? dateTime.format(date) : "—";
}

export function formatPartyDate(value: string | number | Date): string {
  const date = toDate(value);
  return date ? partyDate.format(date) : "—";
}

export function formatClockTime(value: string | number | Date): string {
  const date = toDate(value);
  return date ? clockTime.format(date) : "—";
}

/** Day heading for grouped activity, e.g. "2026년 9월 8일 화". */
export function formatDayLabel(value: string | number | Date): string {
  const date = toDate(value);
  return date ? dayLabel.format(date) : "—";
}

/** Calendar day without a time, for range captions. */
export function formatDateOnly(value: string | number | Date): string {
  const date = toDate(value);
  return date ? dateOnly.format(date) : "—";
}
