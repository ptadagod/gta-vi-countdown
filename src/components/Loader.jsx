import { LOGO_URL } from '../lib/gallery';

export default function Loader({ done }) {
  return (
    <div className={`loader ${done ? 'loader--done' : ''}`} role="status" aria-live="polite">
      <div className="loader__inner">
        <img
          className="loader__logo"
          src={LOGO_URL}
          alt=""
          width="807"
          height="540"
          onLoad={(e) => e.currentTarget.classList.add('is-ready')}
        />
        <div className="loader__bar">
          <div className="loader__fill" />
        </div>
        <p className="loader__text">Welcome to Leonida</p>
      </div>
      <span className="sr-only">{done ? 'Loaded' : 'Loading'}</span>
    </div>
  );
}
