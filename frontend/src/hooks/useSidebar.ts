import { useCallback, useEffect, useState } from 'react';

const MOBILE_MEDIA = '(max-width: 900px)';

function initialCollapsed(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia(MOBILE_MEDIA).matches;
}

export function useSidebar() {
  const [collapsed, setCollapsed] = useState<boolean>(initialCollapsed);

  useEffect(() => {
    const mq = window.matchMedia(MOBILE_MEDIA);
    const onChange = (e: MediaQueryListEvent) => setCollapsed(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const toggle = useCallback(() => setCollapsed((c) => !c), []);
  const close = useCallback(() => setCollapsed(true), []);
  return { collapsed, toggle, close, setCollapsed };
}
