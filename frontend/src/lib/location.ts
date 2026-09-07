export function dedupeLocationValues(values: (string | null | undefined)[]): string[] {
  const seen = new Map<string, string>();
  for (const raw of values) {
    const v = raw?.trim();
    if (!v) continue;
    const key = v.toLowerCase();
    if (!seen.has(key)) seen.set(key, v);
  }
  return Array.from(seen.values()).sort((a, b) => a.localeCompare(b));
}

export function sameLocation(a: string | null | undefined, b: string | null | undefined): boolean {
  return (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase();
}
