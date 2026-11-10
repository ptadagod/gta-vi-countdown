import { useState } from 'react';
import Countdown from './Countdown';

export default function Hero({ stage, now, afterTrailer = false }) {
  // Remember how this timer first appeared, so the class doesn't flip (and restart
  // the animation) once the trailer overlay has gone.
  const [cinematic] = useState(afterTrailer);
  const remaining = stage.targetMs - now;

  return (
    <section id="countdown" className={`hero ${cinematic ? 'hero--cinematic' : ''}`}>
      {/* Heading kept for screen readers only */}
      <h1 className="sr-only">{stage.title}</h1>

      {/* key on stage id → the timer replays its reveal when the stage changes */}
      <div key={`cd-${stage.id}`} className="hero__countdown">
        <Countdown remainingMs={remaining} />
      </div>
    </section>
  );
}
