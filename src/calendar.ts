export interface TradingCalendarConfig { timeZone?: string; sessionOpenHour?: number; sessionOpenMinute?: number; sessionCloseHour?: number; sessionCloseMinute?: number; }

/** US-equity regular session calendar using Intl timezone rules (including DST). */
export class TradingCalendar {
  private readonly config: Required<TradingCalendarConfig>;
  constructor(config: TradingCalendarConfig = {}) { this.config = { timeZone: "America/New_York", sessionOpenHour: 9, sessionOpenMinute: 30, sessionCloseHour: 16, sessionCloseMinute: 0, ...config }; }
  sessionKey(timestamp: number): string { return this.parts(timestamp).map.get("year")! + "-" + this.parts(timestamp).map.get("month")!.padStart(2, "0") + "-" + this.parts(timestamp).map.get("day")!.padStart(2, "0"); }
  isRegularSession(timestamp: number): boolean { const p = this.parts(timestamp); const weekday = new Date(timestamp).toLocaleDateString("en-US", { timeZone: this.config.timeZone, weekday: "short" }); if (weekday === "Sat" || weekday === "Sun") return false; const minutes = Number(p.map.get("hour")) * 60 + Number(p.map.get("minute")); const open = this.config.sessionOpenHour * 60 + this.config.sessionOpenMinute; const close = this.config.sessionCloseHour * 60 + this.config.sessionCloseMinute; return minutes >= open && minutes < close; }
  private parts(timestamp: number) { const parts = new Intl.DateTimeFormat("en-US", { timeZone: this.config.timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(timestamp); return { map: new Map(parts.filter((p) => p.type !== "literal").map((p) => [p.type, p.value])) }; }
}
