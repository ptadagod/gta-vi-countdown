/**
 * Countdown stages.
 *
 * Targets are built with the *local* Date constructor (year, monthIndex, day…),
 * so each target is midnight at the start of the day in the visitor's own
 * timezone — not a single fixed UTC instant. DST is handled by the browser.
 */
export const STAGES = [
  {
    id: 'predownload',
    title: 'PRE DOWNLOAD',
    kicker: 'Pre-load opens in',
    dateLabel: '10 November 2026',
    target: () => new Date(2026, 10, 10, 0, 0, 0, 0),
  },
  {
    id: 'launch',
    title: 'LAUNCH',
    kicker: 'Grand Theft Auto VI arrives in',
    dateLabel: '19 November 2026',
    target: () => new Date(2026, 10, 19, 0, 0, 0, 0),
  },
];

/** Returns the active stage for a given timestamp, or the "launched" state. */
export function getStage(nowMs) {
  for (let i = 0; i < STAGES.length; i++) {
    const stage = STAGES[i];
    const targetMs = stage.target().getTime();
    if (nowMs < targetMs) {
      return { ...stage, index: i, targetMs, launched: false };
    }
  }
  return { id: 'launched', title: 'GTA VI LAUNCHED', index: STAGES.length, launched: true };
}

/** Splits a millisecond difference into days/hours/minutes/seconds. */
export function splitDuration(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return {
    days: Math.floor(total / 86400),
    hours: Math.floor((total % 86400) / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
    total,
  };
}
