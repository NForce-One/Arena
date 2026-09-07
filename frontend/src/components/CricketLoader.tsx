export function CricketLoader({
  label,
  size = 'inline',
}: {
  label: string;
  size?: 'inline' | 'block';
}) {
  const dims = size === 'inline' ? { w: 132, h: 28 } : { w: 208, h: 56 };

  return (
    <span className={`cricket-loader cricket-loader-${size}`} role="status">
      <svg
        width={dims.w}
        height={dims.h}
        viewBox="0 0 132 28"
        fill="none"
        aria-hidden="true"
        className="cricket-loader-svg"
      >
        {}
        <line x1="2" y1="24" x2="130" y2="24" className="cl-crease" />
        {}
        <line x1="112" y1="6" x2="112" y2="21" className="cl-stump" />
        <line x1="117" y1="6" x2="117" y2="21" className="cl-stump" />
        <line x1="122" y1="6" x2="122" y2="21" className="cl-stump" />
        <line x1="110.5" y1="6" x2="123.5" y2="6" className="cl-bail" />
        {}
        <g className="cl-bat">
          <rect x="94" y="9" width="6" height="15" rx="2" className="cl-bat-blade" />
          <rect x="95.5" y="4" width="3" height="6" rx="1.2" className="cl-bat-handle" />
        </g>
        {}
        <circle cx="6" cy="18" r="3.4" className="cl-ball" />
      </svg>
      <span className="sr-only">{label}</span>
    </span>
  );
}
