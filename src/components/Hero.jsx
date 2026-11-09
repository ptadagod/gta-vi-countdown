import { useState } from 'react';
import { Download, Rocket } from 'lucide-react';
import Countdown from './Countdown';

export default function Hero({ stage, now, afterTrailer = false }) {
  // Remember how this timer first appeared, so the class doesn't flip (and restart
  // the animation) once the trailer overlay has gone.
  const [cinematic] = useState(afterTrailer);
  const remaining = stage.targetMs - now;
  const Icon = stage.id === 'predownload' ? Download : Rocket;

  return (
    <section id="countdown" className={`hero ${cinematic ? 'hero--cinematic' : ''}`}>
      {/* Heading kept for screen readers only */}
      <h1 className="sr-only">{stage.title}</h1>

      {/* key on stage id → line and timer replay their reveal when the stage changes */}
      <div key={stage.id} className="hero__eyebrow">
        <span className="pill">
          <Icon size={14} aria-hidden="true" />
          Stage {stage.index + 1} of 2
        </span>
        <span className="hero__kicker">{stage.kicker}</span>
      </div>

      <div key={`cd-${stage.id}`} className="hero__countdown">
        <Countdown remainingMs={remaining} />
      </div>
    </section>
  );
}
