import { useEffect, useState } from 'react';

/**
 * Optional time-travel for testing: `?time=2026-11-09T23:59:50` starts the
 * clock at that *local* time and lets it run forward in real time.
 * Without the parameter the real system clock is used.
 */
function readOffset() {
  try {
    const param = new URLSearchParams(window.location.search).get('time');
    if (!param) return 0;
    const parsed = new Date(param); // date-time without "Z" parses as local time
    if (Number.isNaN(parsed.getTime())) return 0;
    return parsed.getTime() - Date.now();
  } catch {
    return 0;
  }
}

export const TIME_OFFSET = readOffset();
export const IS_SIMULATED = TIME_OFFSET !== 0;
export const currentTime = () => Date.now() + TIME_OFFSET;

/**
 * Returns the current timestamp, re-rendering on every second boundary.
 * Uses a self-correcting timeout chain so ticks stay aligned with the wall
 * clock (no drift), and re-syncs when the tab becomes visible again.
 */
export function useNow() {
  const [now, setNow] = useState(currentTime);

  useEffect(() => {
    let timeoutId;
    const tick = () => {
      const t = currentTime();
      setNow(t);
      timeoutId = setTimeout(tick, 1000 - (t % 1000) + 5);
    };
    timeoutId = setTimeout(tick, 1000 - (currentTime() % 1000) + 5);

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        clearTimeout(timeoutId);
        tick();
      }
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  return now;
}
