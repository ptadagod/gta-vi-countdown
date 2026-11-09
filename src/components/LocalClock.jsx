import { Clock, Globe } from 'lucide-react';
import { timeZoneName, zoneAbbrev } from '../lib/timezone';

const dateFmt = new Intl.DateTimeFormat(undefined, {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});
const timeFmt = new Intl.DateTimeFormat(undefined, {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

export default function LocalClock({ now, compact = false }) {
  return (
    <div className={`clock ${compact ? 'clock--compact' : ''}`}>
      <span className="clock__row">
        <Clock size={14} aria-hidden="true" />
        <time dateTime={new Date(now).toISOString()}>{timeFmt.format(now)}</time>
      </span>
      {!compact && <span className="clock__date">{dateFmt.format(now)}</span>}
      <span className="clock__row clock__tz">
        <Globe size={14} aria-hidden="true" />
        {timeZoneName()} · {zoneAbbrev(now)}
      </span>
    </div>
  );
}
