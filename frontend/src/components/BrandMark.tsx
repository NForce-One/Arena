export function BrandMark({ size = 26 }: { size?: number }) {
  const height = Math.round((size * 50) / 44);
  return (
    <svg width={size} height={height} viewBox="0 0 44 50" fill="none" aria-hidden="true">
      <path
        d="M2 4 L22 1 L42 4 V27 C42 39 33 45.5 22 49 C11 45.5 2 39 2 27 Z"
        fill="#1a1c20"
        stroke="#e11b22"
        strokeWidth="2.4"
      />
      <path d="M13 34 L28 14" stroke="#f6f6f6" strokeWidth="3.4" strokeLinecap="round" />
      <path d="M27 12.5 L31.5 16.5" stroke="#e11b22" strokeWidth="4" strokeLinecap="round" />
      <circle cx="14.5" cy="17" r="3" fill="#f6f6f6" />
      <path d="M20 36 L26 36" stroke="#e11b22" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}
