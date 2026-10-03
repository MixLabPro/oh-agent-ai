/** Query coverage is not replay coverage. Only loaded sessions can grow. */
export function replayStartMs(sessions: ReadonlyArray<{ first_event_at: string }>, from: number, to: number): number {
  const starts = sessions.map((session) => Date.parse(session.first_event_at)).filter((at) => Number.isFinite(at) && at <= to);
  if (!starts.length) return from;
  const day = new Date(Math.min(...starts));
  day.setHours(0, 0, 0, 0);
  return Math.max(from, Math.min(to, day.getTime()));
}
