import { useEffect, useRef, useState } from 'react';
import { preferredWidth } from '../lib/gallery';

const FADE_MS = 1600;

/**
 * Full-screen, fixed background that cross-fades between gallery images.
 * Each new image is preloaded before it fades in, so transitions never flash.
 */
export default function Background({ images, index, onFirstLoad, celebrate }) {
  const [width] = useState(preferredWidth);
  const [layers, setLayers] = useState([]);
  const firstLoaded = useRef(false);
  const keyRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const url = images[index].src(width);
    const img = new Image();
    img.decoding = 'async';
    const show = (ok) => {
      if (cancelled) return;
      if (!firstLoaded.current) {
        firstLoaded.current = true;
        onFirstLoad?.(ok);
      }
      if (!ok) return;
      const key = ++keyRef.current;
      setLayers((prev) => [...prev.slice(-1), { key, url }]);
      setTimeout(() => {
        if (!cancelled) setLayers((prev) => prev.filter((l) => l.key >= key));
      }, FADE_MS + 100);
    };
    img.onload = () => show(true);
    img.onerror = () => show(false);
    img.src = url;
    return () => {
      cancelled = true;
    };
  }, [images, index, width, onFirstLoad]);

  // Quietly preload the next image for a snappy toggle.
  useEffect(() => {
    const next = new Image();
    next.src = images[(index + 1) % images.length].src(width);
  }, [images, index, width]);

  return (
    <div className={`bg ${celebrate ? 'bg--celebrate' : ''}`} aria-hidden="true">
      <div className="bg__fallback" />
      {layers.map((l) => (
        <div key={l.key} className="bg__layer" style={{ backgroundImage: `url("${l.url}")` }} />
      ))}
      <div className="bg__tint" />
      <div className="bg__vignette" />
      <div className="bg__grain" />
      <div className="bg__scan" />
    </div>
  );
}
