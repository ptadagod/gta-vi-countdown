import { splitDuration } from '../lib/stages';

const pad = (n, len = 2) => String(n).padStart(len, '0');

/** One digit that slides in whenever its value changes (keyed remount). */
function Digit({ value }) {
  return (
    <span className="digit">
      <span key={value} className="digit__value">
        {value}
      </span>
    </span>
  );
}

function Unit({ value, label, minLength = 2 }) {
  const str = pad(value, minLength);
  return (
    <div className="unit">
      <span className="unit__digits" aria-hidden="true">
        {str.split('').map((d, i) => (
          // key by position so each slot animates independently
          <Digit key={`${str.length}-${i}`} value={d} />
        ))}
      </span>
      <span className="unit__label">{label}</span>
    </div>
  );
}

export default function Countdown({ remainingMs }) {
  const { days, hours, minutes, seconds } = splitDuration(remainingMs);
  const spoken = `${days} days, ${hours} hours, ${minutes} minutes, ${seconds} seconds`;
  return (
    <div className="countdown" role="timer" aria-label={spoken}>
      <Unit value={days} label="Days" />
      <span className="countdown__sep" aria-hidden="true">:</span>
      <Unit value={hours} label="Hours" />
      <span className="countdown__sep" aria-hidden="true">:</span>
      <Unit value={minutes} label="Minutes" />
      <span className="countdown__sep" aria-hidden="true">:</span>
      <Unit value={seconds} label="Seconds" />
    </div>
  );
}
