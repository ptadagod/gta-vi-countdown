import { useEffect, useRef } from 'react';
import { MapPin } from 'lucide-react';
import { LOGO_URL } from '../lib/gallery';

const COLORS = ['#ff4fa0', '#ff8a3d', '#ffd166', '#b46bff', '#4fd8ff', '#ffffff'];

/** Canvas particle bursts in the GTA VI sunset palette. */
function Fireworks() {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas.getContext('2d');
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let w, h, raf;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const particles = [];

    const resize = () => {
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    const burst = (x, y) => {
      const color = COLORS[(Math.random() * COLORS.length) | 0];
      const n = reduce ? 30 : 90;
      for (let i = 0; i < n; i++) {
        const a = (Math.PI * 2 * i) / n;
        const s = 2 + Math.random() * 4.5;
        particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1, color });
      }
    };

    let last = 0;
    const loop = (t) => {
      if (t - last > (reduce ? 2200 : 650)) {
        last = t;
        burst(w * (0.15 + Math.random() * 0.7), h * (0.15 + Math.random() * 0.4));
      }
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'lighter';
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.vx *= 0.985;
        p.vy = p.vy * 0.985 + 0.05;
        p.x += p.vx;
        p.y += p.vy;
        p.life -= 0.011;
        if (p.life <= 0) {
          particles.splice(i, 1);
          continue;
        }
        ctx.globalAlpha = p.life;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2.2 * p.life + 0.6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return <canvas ref={ref} className="fireworks" aria-hidden="true" />;
}

export default function LaunchScreen() {
  return (
    <section id="countdown" className="launch" aria-live="polite">
      <Fireworks />
      <div className="launch__sweep" aria-hidden="true" />
      <div className="launch__content">
        <span className="pill pill--hot">Out now</span>
        <h1 className="launch__title">
          <img className="launch__logo" src={LOGO_URL} alt="Grand Theft Auto VI" width="807" height="540" />
          <span className="launch__launched">LAUNCHED</span>
        </h1>
        <p className="launch__sub">
          <MapPin size={16} aria-hidden="true" />
          Welcome to the State of Leonida. The wait is over.
        </p>
      </div>
    </section>
  );
}
