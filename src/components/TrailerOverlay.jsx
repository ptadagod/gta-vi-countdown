import { useCallback, useEffect, useRef, useState } from 'react';
import { Volume2, X } from 'lucide-react';
import { loadYouTubeApi } from '../lib/youtube';

export const TRAILER_ID = 'Qqzj-j4qk0E'; // Grand Theft Auto VI – Launch Trailer
const START_SECONDS = 2;
// Stop between 1:27 and 1:28. Checked 10×/second; YouTube's own `end` (1:28) is a backup.
const STOP_SECONDS = 87.5;
const HARD_END_SECONDS = 88;
// Ending: video + sound fade to black, then the black dissolves to the timer.
const FADE_TO_BLACK_MS = 800;
const DISSOLVE_MS = 1200;

const PLAYING = 1;
const BUFFERING = 3;
const ENDED = 0;

/** Turn off subtitles even if the viewer has them on by default in YouTube. */
function hideCaptions(player) {
  try {
    player.unloadModule?.('captions');
    player.unloadModule?.('cc');
    player.setOption?.('captions', 'track', {});
  } catch {
    /* not available */
  }
}

/**
 * Full-screen, chrome-free player for the launch trailer.
 *
 * - YouTube's controls, keyboard shortcuts, fullscreen button and annotations
 *   are switched off with player parameters.
 * - A transparent shield sits on top of the iframe so hovering or clicking
 *   never brings up YouTube's title bar, logo or "More videos" panel.
 * - Browsers only allow autoplay *with sound* after the visitor has
 *   interacted with the page; if sound is blocked it plays muted and shows a
 *   single "Tap for sound" prompt.
 */
export default function TrailerOverlay({ revealing, onFinished, onRevealed }) {
  const mountRef = useRef(null);
  const playerRef = useRef(null);
  const hideTimer = useRef(null);
  const [needsUnmute, setNeedsUnmute] = useState(false);
  const [failed, setFailed] = useState(false);
  const [showClose, setShowClose] = useState(false);
  const [fading, setFading] = useState(false);
  const endRef = useRef(() => {});
  const endTrailer = useCallback(() => endRef.current(), []);

  // Once the parent has swapped the timer in underneath, dissolve the black away.
  useEffect(() => {
    if (!revealing) return;
    const t = setTimeout(onRevealed, DISSOLVE_MS);
    return () => clearTimeout(t);
  }, [revealing, onRevealed]);

  useEffect(() => {
    let cancelled = false;
    let checkTimer;
    let stopWatcher;
    let fadeTimer;
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      clearInterval(stopWatcher);
      setFading(true);
      // Ramp the trailer's volume down alongside the fade to black.
      const p = playerRef.current;
      const startVol = p?.getVolume?.() ?? 100;
      const t0 = performance.now();
      fadeTimer = setInterval(() => {
        const k = Math.min(1, (performance.now() - t0) / FADE_TO_BLACK_MS);
        try {
          p?.setVolume?.(Math.round(startVol * (1 - k)));
        } catch {
          /* player gone */
        }
        if (k >= 1) {
          clearInterval(fadeTimer);
          try {
            p?.pauseVideo();
          } catch {
            /* player gone */
          }
          if (!cancelled) onFinished();
        }
      }, 40);
    };
    endRef.current = finish;

    loadYouTubeApi()
      .then((YT) => {
        if (cancelled || !mountRef.current) return;
        playerRef.current = new YT.Player(mountRef.current, {
          videoId: TRAILER_ID,
          host: 'https://www.youtube-nocookie.com',
          playerVars: {
            autoplay: 1,
            start: START_SECONDS,
            end: HARD_END_SECONDS,
            controls: 0,
            disablekb: 1,
            fs: 0,
            iv_load_policy: 3,
            rel: 0,
            playsinline: 1,
            cc_load_policy: 0,
          },
          events: {
            onReady: (e) => {
              hideCaptions(e.target);
              e.target.unMute();
              e.target.playVideo();
              stopWatcher = setInterval(() => {
                if ((e.target.getCurrentTime?.() ?? 0) >= STOP_SECONDS) finish();
              }, 100);
              // If the browser blocked sound, retry muted.
              checkTimer = setTimeout(() => {
                const state = e.target.getPlayerState?.();
                if (state !== PLAYING && state !== BUFFERING) {
                  e.target.mute();
                  e.target.playVideo();
                  setNeedsUnmute(true);
                }
              }, 1500);
            },
            onStateChange: (e) => {
              if (e.data === PLAYING) hideCaptions(e.target);
              if (e.data === ENDED) finish();
            },
            onError: () => setFailed(true),
          },
        });
      })
      .catch(() => !cancelled && setFailed(true));

    return () => {
      cancelled = true;
      clearTimeout(checkTimer);
      clearInterval(stopWatcher);
      clearInterval(fadeTimer);
      try {
        playerRef.current?.destroy();
      } catch {
        /* already gone */
      }
    };
  }, [onFinished]);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && endTrailer();
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      clearTimeout(hideTimer.current);
    };
  }, [endTrailer]);

  // The close button stays hidden and only appears briefly on mouse move / tap.
  const revealClose = useCallback(() => {
    setShowClose(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setShowClose(false), 2500);
  }, []);

  const unmute = () => {
    const p = playerRef.current;
    if (!p) return;
    p.unMute();
    p.setVolume?.(100);
    p.playVideo();
    setNeedsUnmute(false);
  };

  return (
    <div
      className={`trailer ${fading ? 'trailer--fading' : ''} ${revealing ? 'trailer--revealing' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label="Grand Theft Auto VI launch trailer"
      onPointerMove={revealClose}
      onPointerDown={revealClose}
    >
      {failed ? (
        <a
          className="trailer__fallback"
          href={`https://www.youtube.com/watch?v=${TRAILER_ID}&t=${START_SECONDS}s`}
          target="_blank"
          rel="noreferrer"
        >
          Watch the launch trailer on YouTube
        </a>
      ) : (
        <div className="trailer__video">
          <div ref={mountRef} />
        </div>
      )}

      {/* Shield: blocks hover/clicks so YouTube's overlay UI never appears */}
      <div className="trailer__shield" aria-hidden="true" />

      <button
        type="button"
        className={`trailer__close ${showClose ? 'is-visible' : ''}`}
        onClick={endTrailer}
        onFocus={revealClose}
        aria-label="Close trailer"
      >
        <X size={22} />
      </button>

      {needsUnmute && !fading && (
        <button type="button" className="trailer__unmute" onClick={unmute}>
          <Volume2 size={18} aria-hidden="true" />
          Tap for sound
        </button>
      )}
    </div>
  );
}
