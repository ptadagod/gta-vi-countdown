import { useCallback, useEffect, useRef, useState } from 'react';
import { FlaskConical } from 'lucide-react';
import Background from './components/Background';
import Loader from './components/Loader';
import Nav from './components/Nav';
import Hero from './components/Hero';
import LaunchScreen from './components/LaunchScreen';
import StageFlash from './components/StageFlash';
import TrailerOverlay from './components/TrailerOverlay';
import PreloadOpen from './components/PreloadOpen';
import { loadYouTubeApi } from './lib/youtube';
import LocalClock from './components/LocalClock';
import { useNow, IS_SIMULATED } from './hooks/useNow';
import { useFullscreen } from './hooks/useFullscreen';
import { useStoredState } from './hooks/useStoredState';
import { getStage } from './lib/stages';
import { GALLERY, MOBILE_GALLERY, PORTRAIT_QUERY } from './lib/gallery';
import { useMediaQuery } from './hooks/useMediaQuery';
import { AmbientMusic, playCompletionSound, unlockAudio } from './lib/audio';

const AUTO_ROTATE_MS = 15000;
const ANNOUNCE_MS = 5000; // how long "Pre Load now open" shows before the trailer
const MAX_LOADER_MS = 12000;

export default function App() {
  const now = useNow();
  const stage = getStage(now);
  const fullscreen = useFullscreen();

  // ---------- Loading screen ----------
  // The page appears once the cover intro has played AND the first background is ready.
  const [bgReady, setBgReady] = useState(false);
  const [introDone, setIntroDone] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const loaded = (bgReady && introDone) || timedOut;
  const finishLoading = useCallback(() => setBgReady(true), []);
  const finishIntro = useCallback(() => setIntroDone(true), []);
  useEffect(() => {
    const t = setTimeout(() => setTimedOut(true), MAX_LOADER_MS); // never block on slow networks
    return () => clearTimeout(t);
  }, []);

  // ---------- Backgrounds ----------
  // Upright phones/tablets get Rockstar's portrait images; everything else the widescreen set.
  const isPortrait = useMediaQuery(PORTRAIT_QUERY);
  const images = isPortrait ? MOBILE_GALLERY : GALLERY;
  const [bgIndex, setBgIndex] = useStoredState('gta6.bg', 0);
  const safeBg = Number.isInteger(bgIndex) && bgIndex >= 0 ? bgIndex % images.length : 0;
  const nextBg = useCallback(
    () => setBgIndex((i) => ((i | 0) + 1) % images.length),
    [setBgIndex, images.length],
  );
  const prevBg = useCallback(
    () => setBgIndex((i) => (((i | 0) % images.length) - 1 + images.length) % images.length),
    [setBgIndex, images.length],
  );
  // Gentle auto-rotation; any manual change restarts the timer.
  useEffect(() => {
    const t = setTimeout(nextBg, AUTO_ROTATE_MS);
    return () => clearTimeout(t);
  }, [safeBg, nextBg]);

  // ---------- Audio ----------
  const music = useRef(null);
  const [musicOn, setMusicOn] = useState(false);
  const [alertsOn, setAlertsOn] = useStoredState('gta6.alerts', true);
  const toggleMusic = useCallback(() => {
    unlockAudio();
    setMusicOn((on) => !on);
  }, []);
  const toggleAlerts = useCallback(() => {
    unlockAudio();
    setAlertsOn((on) => {
      if (!on) playCompletionSound(); // preview the sound when enabling
      return !on;
    });
  }, [setAlertsOn]);
  // When PRE DOWNLOAD ends: "Pre Load now open" → launch trailer → LAUNCH timer.
  // preloadPhase is null | 'announce' | 'trailer' | 'reveal' (black dissolving to the timer).
  const [preloadPhase, setPreloadPhase] = useState(null);
  const trailerOpen = preloadPhase === 'trailer';
  const revealing = preloadPhase === 'reveal';
  const onTrailerFinished = useCallback(() => setPreloadPhase('reveal'), []);
  const onTrailerRevealed = useCallback(() => setPreloadPhase(null), []);
  useEffect(() => {
    if (preloadPhase !== 'announce') return;
    const t = setTimeout(() => setPreloadPhase('trailer'), ANNOUNCE_MS);
    return () => clearTimeout(t);
  }, [preloadPhase]);
  const isPreDownload = stage.id === 'predownload';
  useEffect(() => {
    // Warm up the YouTube player API while waiting, so the trailer starts instantly.
    if (isPreDownload) loadYouTubeApi().catch(() => {});
  }, [isPreDownload]);

  useEffect(() => {
    if (!music.current) music.current = new AmbientMusic();
    // Ambient music pauses while the trailer is playing.
    if (musicOn && !trailerOpen) music.current.start();
    else music.current.stop();
  }, [musicOn, trailerOpen]);
  useEffect(() => () => music.current?.stop(), []);

  // ---------- Stage transitions ----------
  const prevStageId = useRef(stage.id);
  const [flash, setFlash] = useState(null);
  const alertsRef = useRef(alertsOn);
  useEffect(() => {
    alertsRef.current = alertsOn;
  }, [alertsOn]);
  useEffect(() => {
    if (prevStageId.current === stage.id) return;
    const from = prevStageId.current;
    prevStageId.current = stage.id;
    if (from === 'predownload') setPreloadPhase('announce');
    else setFlash(stage.launched ? 'GTA VI' : stage.title);
    if (alertsRef.current) playCompletionSound({ big: stage.launched });
  }, [stage.id, stage.launched, stage.title]);
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 2400);
    return () => clearTimeout(t);
  }, [flash]);

  // ---------- Keyboard shortcuts ----------
  useEffect(() => {
    const onKey = (e) => {
      if (trailerOpen || e.target.closest?.('input, textarea, [contenteditable]') || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === 'b' || e.key === 'ArrowRight') nextBg();
      else if (e.key === 'ArrowLeft') prevBg();
      else if (k === 'f') fullscreen.toggle();
      else if (k === 'm') toggleMusic();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [nextBg, prevBg, fullscreen, toggleMusic, trailerOpen]);

  return (
    <div className={`app stage-${stage.id} ${loaded ? 'is-loaded' : ''}`}>
      <Background images={images} index={safeBg} onFirstLoad={finishLoading} celebrate={stage.launched} />
      <Loader done={loaded} onIntroDone={finishIntro} />
      {flash && <StageFlash key={flash} label={flash} />}
      {(trailerOpen || revealing) && (
        <TrailerOverlay revealing={revealing} onFinished={onTrailerFinished} onRevealed={onTrailerRevealed} />
      )}

      <Nav
        now={now}
        bg={{ index: safeBg, total: images.length }}
        onPrevBg={prevBg}
        onNextBg={nextBg}
        musicOn={musicOn}
        onToggleMusic={toggleMusic}
        alertsOn={alertsOn}
        onToggleAlerts={toggleAlerts}
        fullscreen={fullscreen}
      />

      <main>
        {stage.launched ? (
          <LaunchScreen />
        ) : preloadPhase && !revealing ? (
          <PreloadOpen />
        ) : (
          <Hero stage={stage} now={now} afterTrailer={revealing} />
        )}

        <div className="hero-foot">
          <LocalClock now={now} />
          <span className="hero-foot__caption">
            {images[safeBg].caption} · © Rockstar Games
            <br />
            Unofficial fan countdown
          </span>
        </div>
      </main>

      {IS_SIMULATED && (
        <div className="sim-badge" role="note">
          <FlaskConical size={14} aria-hidden="true" />
          Simulated time (?time=) — <a href={window.location.pathname}>use real clock</a>
        </div>
      )}
    </div>
  );
}
