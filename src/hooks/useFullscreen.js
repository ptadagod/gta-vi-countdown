import { useCallback, useEffect, useState } from 'react';

export function useFullscreen() {
  const getEl = () => document.fullscreenElement || document.webkitFullscreenElement;
  const [isFullscreen, setIsFullscreen] = useState(() => !!getEl());
  const supported =
    typeof document !== 'undefined' &&
    !!(document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen);

  useEffect(() => {
    const onChange = () => setIsFullscreen(!!getEl());
    document.addEventListener('fullscreenchange', onChange);
    document.addEventListener('webkitfullscreenchange', onChange);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      document.removeEventListener('webkitfullscreenchange', onChange);
    };
  }, []);

  const toggle = useCallback(async () => {
    const root = document.documentElement;
    try {
      if (getEl()) {
        await (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      } else {
        await (root.requestFullscreen || root.webkitRequestFullscreen).call(root);
      }
    } catch {
      /* user agent refused — ignore */
    }
  }, []);

  return { isFullscreen, toggle, supported };
}
