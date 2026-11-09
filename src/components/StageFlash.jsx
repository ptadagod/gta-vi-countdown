/** Full-screen cinematic wipe shown while one countdown hands over to the next. */
export default function StageFlash({ label }) {
  return (
    <div className="flash" aria-hidden="true">
      <div className="flash__bar flash__bar--a" />
      <div className="flash__bar flash__bar--b" />
      <div className="flash__label">{label}</div>
    </div>
  );
}
