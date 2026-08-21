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
