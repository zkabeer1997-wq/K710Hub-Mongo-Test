'use client';

import { useEffect, useRef, useState } from 'react';
import { NO_PLACEHOLDER_QUERY } from '../../lib/siteImages.mjs';

// A Help picture that disappears cleanly when the image cannot be loaded (missing site image,
// Drive outage). It requests the image without the SVG placeholder, so a failure fires onError;
// the figure then removes itself and the section falls back to its one-column text layout.
export default function HelpFigure({ url, alt, caption, width, height }) {
  const [failed, setFailed] = useState(false);
  const ref = useRef(null);
  const src = `${url}${url.includes('?') ? '&' : '?'}${NO_PLACEHOLDER_QUERY}`;

  useEffect(() => {
    const section = ref.current?.closest('.help-section');
    if (!section) return;
    section.classList.toggle('has-image', !failed);
  }, [failed]);

  // An image that failed before hydration never fires onError again: check it once on mount.
  useEffect(() => {
    const img = ref.current?.querySelector('img');
    if (img && img.complete && img.naturalWidth === 0) setFailed(true);
  }, []);

  if (failed) return null;
  return (
    <figure className="help-figure" ref={ref}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} loading="lazy" decoding="async" width={width || 640} height={height || 480} onError={() => setFailed(true)} />
      {caption ? <figcaption>{caption}</figcaption> : null}
    </figure>
  );
}
