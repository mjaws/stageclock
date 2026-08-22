export interface TimeOfDay {
  /** "H:MM" in 12-hour time, no leading zero on the hour. */
  hm: string;
  /** "SS", zero-padded. */
  seconds: string;
  period: "AM" | "PM";
}

export function formatTimeOfDay(date: Date): TimeOfDay {
  const hours24 = date.getHours();
  const period: "AM" | "PM" = hours24 >= 12 ? "PM" : "AM";
  const hours12 = hours24 % 12 || 12;
  const mm = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  return { hm: `${hours12}:${mm}`, seconds: ss, period };
}
