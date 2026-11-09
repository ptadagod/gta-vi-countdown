import { useEffect, useState } from 'react';
import {
  Bell,
  BellOff,
  ChevronLeft,
  ChevronRight,
  Maximize,
  Menu,
  Minimize,
  Music,
  VolumeX,
  X,
} from 'lucide-react';
import LocalClock from './LocalClock';
import { LOGO_URL } from '../lib/gallery';

function IconButton({ onClick, label, active, children, disabled }) {
  return (
    <button
      type="button"
      className={`icon-btn ${active ? 'icon-btn--active' : ''}`}
      onClick={onClick}
      aria-label={label}
      aria-pressed={active === undefined ? undefined : active}
      title={label}
      disabled={disabled}
    >
      {children}
      <span className="icon-btn__label">{label}</span>
    </button>
  );
}

export default function Nav({
  now,
  bg,
  onPrevBg,
  onNextBg,
  musicOn,
  onToggleMusic,
  alertsOn,
  onToggleAlerts,
  fullscreen,
}) {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const controls = (
    <>
      <div className="bg-switch" role="group" aria-label="Background image">
        <IconButton onClick={onPrevBg} label="Previous background">
          <ChevronLeft size={18} />
        </IconButton>
        <span className="bg-switch__count" aria-live="polite">
          {String(bg.index + 1).padStart(2, '0')}
          <em>/{String(bg.total).padStart(2, '0')}</em>
        </span>
        <IconButton onClick={onNextBg} label="Next background">
          <ChevronRight size={18} />
        </IconButton>
      </div>
      <IconButton onClick={onToggleMusic} label={musicOn ? 'Music on' : 'Music off'} active={musicOn}>
        {musicOn ? <Music size={18} /> : <VolumeX size={18} />}
      </IconButton>
      <IconButton
        onClick={onToggleAlerts}
        label={alertsOn ? 'Completion sound on' : 'Completion sound off'}
        active={alertsOn}
      >
        {alertsOn ? <Bell size={18} /> : <BellOff size={18} />}
      </IconButton>
      <IconButton
        onClick={fullscreen.toggle}
        label={fullscreen.isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
        active={fullscreen.isFullscreen}
        disabled={!fullscreen.supported}
      >
        {fullscreen.isFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
      </IconButton>
    </>
  );

  return (
    <>
    <header className={`nav ${scrolled ? 'nav--scrolled' : ''} ${open ? 'nav--open' : ''}`}>
      <div className="nav__brand">
        <img className="nav__logo" src={LOGO_URL} alt="Grand Theft Auto VI" width="807" height="540" />
      </div>

      <div className="nav__right">
        <LocalClock now={now} compact />
        <div className="nav__controls">{controls}</div>
        <button
          type="button"
          className="nav__burger"
          aria-label={open ? 'Close controls' : 'Open controls'}
          aria-expanded={open}
          aria-controls="mobile-menu"
          onClick={() => setOpen((o) => !o)}
        >
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>
    </header>

    {/* Sibling of the header: a fixed element inside a backdrop-filtered parent would be clipped */}
    <div id="mobile-menu" className="drawer" hidden={!open}>
        <div className="drawer__controls">{controls}</div>
        <LocalClock now={now} />
      </div>
    </>
  );
}
