import type { SVGProps } from 'react';

export type IconName =
  | 'home'
  | 'trophy'
  | 'calendar'
  | 'bell'
  | 'person'
  | 'gear'
  | 'logout'
  | 'chevrons-left'
  | 'menu'
  | 'search'
  | 'envelope'
  | 'mega'
  | 'users'
  | 'bat'
  | 'ball'
  | 'star'
  | 'arrow-right'
  | 'refresh'
  | 'shield-check'
  | 'chevron-right'
  | 'chevron-down'
  | 'map-pin'
  | 'clipboard'
  | 'plus'
  | 'x'
  | 'phone'
  | 'school'
  | 'shirt'
  | 'check';

interface IconProps extends SVGProps<SVGSVGElement> {
  name: IconName;
  size?: number;
}

const strokeProps = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

export function Icon({ name, size = 20, ...rest }: IconProps) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', 'aria-hidden': true, ...rest };

  switch (name) {
    case 'home':
      return (
        <svg {...common} {...strokeProps}>
          <path d="M3 11.5 12 4l9 7.5" />
          <path d="M5 10v9a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1v-9" />
        </svg>
      );
    case 'trophy':
      return (
        <svg {...common} {...strokeProps}>
          <path d="M7 4h10v4a5 5 0 0 1-10 0V4z" />
          <path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3" />
          <path d="M9 14h6l-.5 4h-5L9 14zM8 20h8" />
        </svg>
      );
    case 'calendar':
      return (
        <svg {...common} {...strokeProps}>
          <rect x="3.5" y="5" width="17" height="15" rx="2" />
          <path d="M3.5 10h17M8 3v4M16 3v4" />
        </svg>
      );
    case 'bell':
      return (
        <svg {...common} {...strokeProps}>
          <path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15L6 16z" />
          <path d="M10.5 20a2 2 0 0 0 3 0" />
        </svg>
      );
    case 'person':
      return (
        <svg {...common} {...strokeProps}>
          <circle cx="12" cy="8" r="3.5" />
          <path d="M4.5 20c1-4 4-6 7.5-6s6.5 2 7.5 6" />
        </svg>
      );
    case 'gear':
      return (
        <svg {...common} {...strokeProps}>
          <circle cx="12" cy="12" r="3" />
          <path d="M12 3v2M12 19v2M4.2 4.2l1.5 1.5M18.3 18.3l1.5 1.5M3 12h2M19 12h2M4.2 19.8l1.5-1.5M18.3 5.7l1.5-1.5" />
        </svg>
      );
    case 'logout':
      return (
        <svg {...common} {...strokeProps}>
          <path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4" />
          <path d="M15 8l4 4-4 4M9 12h10" />
        </svg>
      );
    case 'chevrons-left':
      return (
        <svg {...common} {...strokeProps}>
          <path d="M13 6l-6 6 6 6M19 6l-6 6 6 6" />
        </svg>
      );
    case 'menu':
      return (
        <svg {...common} {...strokeProps}>
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      );
    case 'search':
      return (
        <svg {...common} {...strokeProps}>
          <circle cx="11" cy="11" r="6.5" />
          <path d="m20 20-4-4" />
        </svg>
      );
    case 'envelope':
      return (
        <svg {...common} {...strokeProps}>
          <rect x="3.5" y="6" width="17" height="12" rx="2" />
          <path d="m4 8 8 6 8-6" />
        </svg>
      );
    case 'mega':
      return (
        <svg {...common} {...strokeProps}>
          <path d="M4 10v4l11 4V6L4 10z" />
          <path d="M4 10H3a1 1 0 0 0-1 1v2a1 1 0 0 0 1 1h1M18 9a4 4 0 0 1 0 6" />
        </svg>
      );
    case 'users':
      return (
        <svg {...common} {...strokeProps}>
          <circle cx="9" cy="9" r="3.2" />
          <path d="M3 19c.8-3.4 3.2-5 6-5s5.2 1.6 6 5" />
          <circle cx="17.5" cy="8.5" r="2.5" />
          <path d="M15 14.5c2.5 0 4.5 1.4 5.5 4" />
        </svg>
      );
    case 'bat':
      return (
        <svg {...common} {...strokeProps}>
          <path d="M13.4 3.7 20 10.3l-7.4 7.4a2 2 0 0 1-2.8 0l-3.8-3.8a2 2 0 0 1 0-2.8l7.4-7.4z" />
          <path d="M8 16 4 20" />
          <circle cx="4.6" cy="19.4" r="1.1" fill="currentColor" stroke="none" />
        </svg>
      );
    case 'ball':
      return (
        <svg {...common} {...strokeProps}>
          <circle cx="12" cy="12" r="8" />
          <path
            d="M4.6 9.5c3-.6 6-.6 9 0s5.8.6 5.8.6M4.6 14.5c3 .6 6 .6 9 0s5.8-.6 5.8-.6"
            strokeDasharray="1.5 2.5"
          />
        </svg>
      );
    case 'star':
      return (
        <svg {...common} {...strokeProps}>
          <path d="m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 17l-5.3 2.7 1-5.9-4.2-4.1 5.9-.8L12 3.5z" />
        </svg>
      );
    case 'arrow-right':
      return (
        <svg {...common} {...strokeProps}>
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      );
    case 'refresh':
      return (
        <svg {...common} {...strokeProps}>
          <path d="M20 12a8 8 0 1 1-2.3-5.6" />
          <path d="M20 4v4h-4" />
        </svg>
      );
    case 'shield-check':
      return (
        <svg {...common} {...strokeProps}>
          <path d="M12 3l8 3v5c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6l8-3z" />
          <path d="m8.5 12.2 2.4 2.3 4.6-4.6" />
        </svg>
      );
    case 'chevron-right':
      return (
        <svg {...common} {...strokeProps}>
          <path d="m9 6 6 6-6 6" />
        </svg>
      );
    case 'chevron-down':
      return (
        <svg {...common} {...strokeProps}>
          <path d="m6 9 6 6 6-6" />
        </svg>
      );
    case 'map-pin':
      return (
        <svg {...common} {...strokeProps}>
          <path d="M12 21s7-6.4 7-11.5A7 7 0 0 0 5 9.5C5 14.6 12 21 12 21z" />
          <circle cx="12" cy="9.5" r="2.5" />
        </svg>
      );
    case 'clipboard':
      return (
        <svg {...common} {...strokeProps}>
          <rect x="5" y="4" width="14" height="17" rx="2" />
          <path d="M9 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1M8 10h8M8 14h8M8 18h5" />
        </svg>
      );
    case 'plus':
      return (
        <svg {...common} {...strokeProps}>
          <path d="M12 5v14M5 12h14" />
        </svg>
      );
    case 'x':
      return (
        <svg {...common} {...strokeProps}>
          <path d="M6 6l12 12M18 6 6 18" />
        </svg>
      );
    case 'phone':
      return (
        <svg {...common} {...strokeProps}>
          <path d="M6.6 10.8c1.4 2.8 3.8 5.2 6.6 6.6l2.2-2.2c.3-.3.7-.4 1.1-.3 1.2.4 2.5.6 3.8.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C11.6 21 3 12.4 3 3c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.6.6 3.8.1.4 0 .8-.3 1.1L6.6 10.8z" />
        </svg>
      );
    case 'school':
      return (
        <svg {...common} {...strokeProps}>
          <path d="M2 9 12 4l10 5-10 5L2 9z" />
          <path d="M6 11.3V17c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5v-5.7" />
          <path d="M21 9v6" />
        </svg>
      );
    case 'shirt':
      return (
        <svg {...common} {...strokeProps}>
          <path d="M8 4 4 7l2.2 3.2L8 9v10a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V9l1.8 1.2L20 7l-4-3-2 1.8h-4L8 4z" />
        </svg>
      );
    case 'check':
      return (
        <svg {...common} {...strokeProps}>
          <path d="M5 12.5 9.5 17 19 7" />
        </svg>
      );
  }
}
