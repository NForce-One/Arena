export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffMs = Math.max(0, now - then);
  const min = 60 * 1000;
  const hr = 60 * min;
  const day = 24 * hr;
  const wk = 7 * day;
  if (diffMs < 45 * min) return 'Just now';
  if (diffMs < day) return `${Math.floor(diffMs / hr)}h ago`;
  if (diffMs < 2 * day) return 'Yesterday';
  if (diffMs < wk) return `${Math.floor(diffMs / day)}d ago`;
  if (diffMs < 5 * wk) return `${Math.floor(diffMs / wk)}w ago`;
  return `${Math.floor(diffMs / (30 * day))}mo ago`;
}

export function tooltipTime(iso: string): string {
  const d = new Date(iso);
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  const h12 = d.getUTCHours() % 12 || 12;
  const period = d.getUTCHours() >= 12 ? 'PM' : 'AM';
  return `${months[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()} · ${h12}:${d
    .getUTCMinutes()
    .toString()
    .padStart(2, '0')} ${period}`;
}
