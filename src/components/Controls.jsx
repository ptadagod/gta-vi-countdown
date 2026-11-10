import { Bell, BellOff, Maximize, Minimize, Music, VolumeX } from 'lucide-react';

function IconButton({ onClick, label, active, children, disabled, ...rest }) {
  return (
    <button
      type="button"
      className={`icon-btn ${active ? 'icon-btn--active' : ''}`}
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      title={label}
      disabled={disabled}
      {...rest}
    >
      {children}
    </button>
  );
}

/** Bottom-right buttons: music, completion sound, fullscreen. */
export default function Controls({ musicOn, onToggleMusic, alertsOn, onToggleAlerts, fullscreen }) {
  return (
    <div className="controls" role="group" aria-label="Page controls">
      <IconButton
        onClick={onToggleMusic}
        label={musicOn ? 'Music on' : 'Music off'}
        active={musicOn}
        data-music-toggle=""
      >
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
    </div>
  );
}
