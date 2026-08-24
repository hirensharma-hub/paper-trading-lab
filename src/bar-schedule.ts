import type { TradingCalendar } from "./calendar";

export interface BarSchedule {
  readonly intervalMs: number;
  nextBarStart(currentBarStartMs: number): number;
  nthNextBarStart(currentBarStartMs: number, count: number): number;
}

/** Expected exchange-session bar clock used only when a complete future bar sequence is unavailable. */
export class ExpectedBarClock implements BarSchedule {
  constructor(readonly calendar: TradingCalendar, readonly intervalMs: number) {
    if (!Number.isFinite(intervalMs) || intervalMs <= 0) throw new Error("Bar interval must be positive");
  }

  nextBarStart(currentBarStartMs: number): number {
    if (!Number.isFinite(currentBarStartMs)) throw new Error("Bar timestamp must be finite");
    const sameSessionCandidate = currentBarStartMs + this.intervalMs;
    if (this.calendar.isRegularSession(sameSessionCandidate) && this.calendar.sessionKey(sameSessionCandidate) === this.calendar.sessionKey(currentBarStartMs)) return sameSessionCandidate;
    for (let day = 1; day <= 370; day++) {
      const probe = currentBarStartMs + day * 86_400_000;
      const bounds = this.calendar.sessionBounds(probe);
      if (this.calendar.isRegularSession(bounds.openMs)) return bounds.openMs;
    }
    throw new Error("Unable to find the next eligible trading session");
  }

  nthNextBarStart(currentBarStartMs: number, count: number): number {
    if (!Number.isInteger(count) || count < 0) throw new Error("Bar count must be a non-negative integer");
    let value = currentBarStartMs;
    for (let index = 0; index < count; index++) value = this.nextBarStart(value);
    return value;
  }
}
