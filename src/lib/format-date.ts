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

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

/**
 * `<input type="datetime-local">` 값. 브라우저 로컬 시간 기준 `YYYY-MM-DDTHH:mm`.
 * 콘솔이 저장 시 `new Date(raw).toISOString()`으로 되돌리므로 같은 로컬 기준을 쓴다.
 */
export function toDateTimeLocalInputValue(value: unknown): string {
  if (typeof value !== "string" && typeof value !== "number" && !(value instanceof Date)) {
    return "";
  }
  if (value === "") return "";
  const date = toDate(value);
  if (!date) return "";
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}T${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}
