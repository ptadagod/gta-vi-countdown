import { useEffect, useRef, useState } from 'react';
import { INTRO_LAYERS, LOGO_URL } from '../lib/gallery';

/** Panels fly in one at a time, this far apart (logo timings live in index.css). */
const PANEL_STAGGER_S = 0.25;
/** Length of the cover fly-in, plus a short hold on the finished cover. */
const INTRO_MS = 5300 + 500;
/** Give up on the intro if its layers haven't loaded by then. */
const LAYER_TIMEOUT_MS = 5000;

const layerWidth = () => {
  const w = Math.min(window.innerWidth * 1.7, window.innerHeight * 1.78) * (window.devicePixelRatio || 1);
  return [1280, 1920, 2560].find((s) => s >= w) || 2560;
};

function preload(urls, timeout) {
  const all = Promise.all(
    urls.map(
      (u) =>
        new Promise((resolve, reject) => {
          const img = new Image();
          img.decoding = 'async';
          // Decode ahead of time for a smooth first frame, but never wait on it for
          // long: decode() can stall in background tabs.
          img.onload = () =>
            Promise.race([
              img.decode ? img.decode().catch(() => {}) : null,
              new Promise((r) => setTimeout(r, 250)),
            ]).then(resolve);
          img.onerror = reject;
          img.src = u;
        }),
    ),
  );
  const timer = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), timeout));
  return Promise.race([all, timer]);
}

/**
 * Loading screen: recreates the GTA VI cover intro — each artwork panel flies
 * in from deep in 3D space, the camera pulls back, and the logo glows on.
 * Falls back to a simple logo if the layers can't load quickly.
 */
export default function Loader({ done, onIntroDone }) {
  // 'loading' → 'playing' → 'finished', or 'fallback' if the layers fail.
  const [phase, setPhase] = useState('loading');
  const [width] = useState(layerWidth);
  const doneRef = useRef(onIntroDone);
  useEffect(() => {
    doneRef.current = onIntroDone;
  }, [onIntroDone]);

  useEffect(() => {
    let cancelled = false;
    let t;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    preload(
      INTRO_LAYERS.map((l) => l.src(width)),
      LAYER_TIMEOUT_MS,
    )
      .then(() => {
        if (cancelled) return;
        setPhase('playing');
        t = setTimeout(() => {
          setPhase('finished');
          doneRef.current?.();
        }, reduce ? 1200 : INTRO_MS);
      })
      .catch(() => {
        if (cancelled) return;
        setPhase('fallback');
        t = setTimeout(() => doneRef.current?.(), 1200);
      });
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [width]);

  const showIntro = phase === 'playing' || phase === 'finished';

  return (
    <div className={`loader loader--${phase} ${done ? 'loader--done' : ''}`} role="status" aria-live="polite">
      {showIntro ? (
        <div className="intro" aria-hidden="true">
          <div className="intro__stage">
            {INTRO_LAYERS.map((l, i) => (
              <img
                key={i}
                className={`intro__layer intro__layer--${l.kind}`}
                style={{ '--z': l.z, '--d': l.kind === 'shard' ? `${i * PANEL_STAGGER_S}s` : undefined }}
                src={l.src(width)}
                alt=""
                draggable="false"
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="loader__inner">
          {phase === 'fallback' && (
            <img className="loader__logo is-ready" src={LOGO_URL} alt="" width="807" height="540" />
          )}
          <div className="loader__bar">
            <div className="loader__fill" />
          </div>
          <p className="loader__text">Welcome to Leonida</p>
        </div>
      )}
      <span className="sr-only">{done ? 'Loaded' : 'Loading'}</span>
    </div>
  );
}
