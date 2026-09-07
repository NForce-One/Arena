import styles from './TeamMonogram.module.css';

interface Props {
  name: string;
  size?: 'sm' | 'md' | 'lg';
}

const SIZE_CLASS: Record<NonNullable<Props['size']>, string> = {
  sm: styles.sm ?? '',
  md: styles.md ?? '',
  lg: styles.lg ?? '',
};

export function monogramOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return ((words[0]?.[0] ?? '') + (words[1]?.[0] ?? '')).toUpperCase();
}

export function TeamMonogram({ name, size = 'md' }: Props) {
  return (
    <span className={`${styles.disc ?? ''} ${SIZE_CLASS[size]}`} aria-hidden="true">
      {monogramOf(name)}
    </span>
  );
}
