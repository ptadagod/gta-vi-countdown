/**
 * - Background music: an MP3 playlist (see PLAYLIST below).
 * - Completion sound: a bright rising chime + low boom, synthesised live
 *   with the Web Audio API.
 */
let ctx = null;
function getCtx() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

/**
 * Background music playlist. Files live in /public/music and play in order,
 * looping back to the first track after the last.
 */
export const PLAYLIST = Array.from(
  { length: 9 },
  (_, i) => `${import.meta.env.BASE_URL}music/track${i + 1}.mp3`,
);
const MUSIC_VOLUME = 0.6;
const FADE_MS = 1200;

export class AmbientMusic {
  constructor(tracks = PLAYLIST) {
    this.tracks = tracks;
    this.index = 0;
    this.playing = false;
    this.fadeTimer = null;
    this.audio = new Audio();
    this.audio.preload = 'none'; // don't download anything until music is switched on
    this.audio.volume = 0;
    this.audio.src = this.tracks[0];
    this.audio.addEventListener('ended', () => this.next());
    // Skip a track that fails to load instead of going silent.
    this.audio.addEventListener('error', () => {
      if (this.playing) setTimeout(() => this.next(), 500);
    });
  }

  next() {
    this.index = (this.index + 1) % this.tracks.length;
    this.audio.src = this.tracks[this.index];
    if (this.playing) this.audio.play().catch(() => {});
  }

  // Timer-based (not requestAnimationFrame) so fades still finish in background tabs.
  fadeTo(target, then) {
    clearInterval(this.fadeTimer);
    const from = this.audio.volume;
    const t0 = performance.now();
    this.fadeTimer = setInterval(() => {
      const k = Math.min(1, (performance.now() - t0) / FADE_MS);
      this.audio.volume = from + (target - from) * k;
      if (k >= 1) {
        clearInterval(this.fadeTimer);
        then?.();
      }
    }, 40);
  }

  start() {
    if (this.playing) return;
    this.playing = true;
    this.audio.play().catch(() => {
      this.playing = false; // browser refused (no user gesture yet)
    });
    this.fadeTo(MUSIC_VOLUME);
  }

  /** Fades out and pauses; the next start() resumes from the same spot. */
  stop() {
    if (!this.playing) return;
    this.playing = false;
    this.fadeTo(0, () => {
      if (!this.playing) this.audio.pause();
    });
  }
}

/** Celebratory completion sound for when a countdown hits zero. */
export function playCompletionSound({ big = false } = {}) {
  const ac = getCtx();
  if (!ac) return;
  const t = ac.currentTime + 0.02;
  const out = ac.createGain();
  out.gain.value = 0.5;
  out.connect(ac.destination);

  // Low boom
  const boom = ac.createOscillator();
  boom.type = 'sine';
  boom.frequency.setValueAtTime(140, t);
  boom.frequency.exponentialRampToValueAtTime(38, t + 1.2);
  const bg = ac.createGain();
  bg.gain.setValueAtTime(0.9, t);
  bg.gain.exponentialRampToValueAtTime(0.001, t + 1.6);
  boom.connect(bg).connect(out);
  boom.start(t);
  boom.stop(t + 1.7);

  // Rising arpeggio chime
  const notes = big ? [69, 73, 76, 81, 85, 88] : [69, 73, 76, 81];
  notes.forEach((n, i) => {
    const nt = t + i * 0.11;
    const o = ac.createOscillator();
    o.type = 'triangle';
    o.frequency.value = midi(n);
    const g = ac.createGain();
    g.gain.setValueAtTime(0, nt);
    g.gain.linearRampToValueAtTime(0.25, nt + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, nt + 1.4);
    o.connect(g).connect(out);
    o.start(nt);
    o.stop(nt + 1.5);
  });
}

/** Must be called from a user gesture on some browsers to unlock audio. */
export function unlockAudio() {
  getCtx();
}
