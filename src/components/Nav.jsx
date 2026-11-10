import { LOGO_URL } from '../lib/gallery';

/** Top bar: just the GTA VI logo. */
export default function Nav() {
  return (
    <header className="nav">
      <div className="nav__brand">
        <img className="nav__logo" src={LOGO_URL} alt="Grand Theft Auto VI" width="807" height="540" />
      </div>
    </header>
  );
}
