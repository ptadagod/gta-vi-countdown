import { Download } from 'lucide-react';

/** Shown the moment the PRE DOWNLOAD countdown hits zero, before the trailer plays. */
export default function PreloadOpen() {
  return (
    <section className="hero preload-open" aria-live="assertive">
      <span className="preload-open__icon" aria-hidden="true">
        <Download size={30} />
      </span>
      <h1 className="preload-open__title">
        <span className="preload-open__line">Pre Load</span>
        <span className="preload-open__line preload-open__line--accent">Now Open</span>
      </h1>
      <span className="preload-open__bar" aria-hidden="true" />
    </section>
  );
}
