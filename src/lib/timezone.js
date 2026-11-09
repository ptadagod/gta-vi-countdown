const TZ = (() => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Local time';
  } catch {
    return 'Local time';
  }
})();

/** The visitor's IANA timezone, e.g. "America/New York". */
export function timeZoneName() {
  return TZ.replace(/_/g, ' ');
}

/** e.g. "GMT+1" / "PST" for the visitor's zone at a given moment. */
export function zoneAbbrev(ms) {
  try {
    const parts = new Intl.DateTimeFormat(undefined, { timeZoneName: 'short' }).formatToParts(ms);
    return parts.find((p) => p.type === 'timeZoneName')?.value ?? '';
  } catch {
    return '';
  }
}
