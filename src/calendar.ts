export interface TradingCalendarConfig { timeZone?: string; sessionOpenHour?: number; sessionOpenMinute?: number; sessionCloseHour?: number; sessionCloseMinute?: number; holidays?: readonly string[]; earlyCloses?: Readonly<Record<string, number>>; }
export interface HolidayProvider { isHoliday(sessionKey: string): boolean; earlyCloseMinutes(sessionKey: string): number | null; }

export class ConfiguredHolidayProvider implements HolidayProvider {
  constructor(private readonly holidays: readonly string[] = [], private readonly earlyCloses: Readonly<Record<string, number>> = {}) {}
  isHoliday(sessionKey: string) { return this.holidays.includes(sessionKey); }
  earlyCloseMinutes(sessionKey: string) { return this.earlyCloses[sessionKey] ?? null; }
}

/** Regular-session calendar with an injectable holiday provider; not a complete exchange calendar. */
export class TradingCalendar {
  private readonly config: Required<Omit<TradingCalendarConfig, "holidays" | "earlyCloses">>;
  private readonly holidayProvider: HolidayProvider;
  constructor(config: TradingCalendarConfig = {}, holidayProvider?: HolidayProvider) { this.config = { timeZone: "America/New_York", sessionOpenHour: 9, sessionOpenMinute: 30, sessionCloseHour: 16, sessionCloseMinute: 0, ...config }; this.holidayProvider = holidayProvider ?? new ConfiguredHolidayProvider(config.holidays, config.earlyCloses); }
  sessionKey(timestamp: number): string { const map = this.localParts(timestamp); return `${map.get("year")}-${map.get("month")}-${map.get("day")}`; }
  isTradingDay(timestamp: number): boolean { const key = this.sessionKey(timestamp); const weekday = new Date(timestamp).toLocaleDateString("en-US", { timeZone: this.config.timeZone, weekday: "short" }); return weekday !== "Sat" && weekday !== "Sun" && !this.holidayProvider.isHoliday(key); }
  isRegularSession(timestamp: number): boolean { if (!this.isTradingDay(timestamp)) return false; const map = this.localParts(timestamp); const minutes = Number(map.get("hour")) * 60 + Number(map.get("minute")); return minutes >= this.sessionOpenMinutes() && minutes < this.sessionCloseMinutes(this.sessionKey(timestamp)); }
  sessionOpen(timestamp: number) { return this.sessionOpenMinutes(); }
  sessionClose(timestamp: number) { return this.sessionCloseMinutes(this.sessionKey(timestamp)); }
  sessionBounds(timestamp: number): { openMs: number; closeMs: number; sessionKey: string } { const key = this.sessionKey(timestamp); const date = new Date(timestamp); const open = new Date(date); const close = new Date(date); const offset = date.getTimezoneOffset(); open.setHours(Math.floor(this.sessionOpenMinutes() / 60), this.sessionOpenMinutes() % 60, 0, 0); close.setHours(Math.floor(this.sessionCloseMinutes(key) / 60), this.sessionCloseMinutes(key) % 60, 0, 0); return { openMs: open.getTime() + offset * 60_000, closeMs: close.getTime() + offset * 60_000, sessionKey: key }; }
  private sessionOpenMinutes() { return this.config.sessionOpenHour * 60 + this.config.sessionOpenMinute; }
  private sessionCloseMinutes(key: string) { return this.holidayProvider.earlyCloseMinutes(key) ?? this.config.sessionCloseHour * 60 + this.config.sessionCloseMinute; }
  private localParts(timestamp: number) { const parts = new Intl.DateTimeFormat("en-US", { timeZone: this.config.timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(timestamp); return new Map(parts.filter((p) => p.type !== "literal").map((p) => [p.type, p.value])); }
}
