import { useCallback, useLayoutEffect, useRef, useState } from 'react';

interface Position {
  top: number;
  left: number;
}

export function useAnchoredPopover(open: boolean, onClose: () => void, contentSignal?: unknown) {
  const triggerRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<Position | null>(null);

  const reposition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const triggerRect = trigger.getBoundingClientRect();
    const popoverRect = popoverRef.current?.getBoundingClientRect();
    const height = popoverRect?.height ?? 0;
    const width = popoverRect?.width ?? 0;

    const spaceBelow = window.innerHeight - triggerRect.bottom;
    const spaceAbove = triggerRect.top;
    const fitsBelow = height + 12 <= spaceBelow;
    const top = fitsBelow
      ? triggerRect.bottom + 4
      : spaceAbove > spaceBelow
        ? Math.max(8, triggerRect.top - height - 4)
        : Math.max(8, window.innerHeight - 8 - height);

    let left = triggerRect.left;
    const overflowX = left + width - (window.innerWidth - 8);
    if (overflowX > 0) left = Math.max(8, left - overflowX);

    setPosition({ top, left });
  }, []);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) {
      setPosition(null);
      return;
    }
    triggerRef.current.scrollIntoView({ block: 'center' });
    reposition();
  }, [open, reposition]);

  useLayoutEffect(() => {
    if (!open || !popoverRef.current) return;
    reposition();
  }, [open, contentSignal]);

  useLayoutEffect(() => {
    if (!open || !popoverRef.current) return;
    const el = popoverRef.current;
    reposition();
    const ro = new ResizeObserver(() => reposition());
    ro.observe(el);
    return () => ro.disconnect();
  }, [open, position !== null, reposition]);

  useLayoutEffect(() => {
    if (!open) return;
    function onScrollOrResize(e: Event) {
      if (e.target instanceof Node && popoverRef.current?.contains(e.target)) return;
      onClose();
    }
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
    return () => {
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, [open, onClose]);

  return { triggerRef, popoverRef, position };
}
