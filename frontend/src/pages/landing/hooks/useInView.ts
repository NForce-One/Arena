import { useEffect, useState, type RefObject } from 'react';

export function useInView(
  ref: RefObject<Element | null>,
  options: IntersectionObserverInit = { threshold: 0.3 },
  once = true,
): boolean {
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          setInView(true);
          if (once) io.disconnect();
        } else if (!once) {
          setInView(false);
        }
      });
    }, options);
    io.observe(el);
    return () => io.disconnect();
  }, [ref, once, options]);

  return inView;
}
