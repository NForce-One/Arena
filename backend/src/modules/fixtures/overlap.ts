export function slotsOverlap(
  aStart: Date,
  aDurationMin: number,
  bStart: Date,
  bDurationMin: number,
): boolean {
  const aStartMs = aStart.getTime();
  const aEndMs = aStartMs + aDurationMin * 60_000;
  const bStartMs = bStart.getTime();
  const bEndMs = bStartMs + bDurationMin * 60_000;
  return aStartMs < bEndMs && bStartMs < aEndMs;
}
