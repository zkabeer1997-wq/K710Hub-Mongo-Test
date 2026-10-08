'use client';

import { useState } from 'react';

/**
 * Owner-supplied game art with a graceful fallback. Remounts per `src` so the CSS fade-in replays on every change,
 * and renders `fallback` (instead of the image and any `children` overlay) (the drawn tile / gem) when the image fails to load. Lazy, async-decoded, fixed intrinsic size.
 */
export default function LoadoutArt({ src, alt = '', className = '', fallback = null, children = null }) {
  const [failed, setFailed] = useState(null);
  if (!src || failed === src) return fallback;
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img key={src} src={src} alt={alt} className={`lo-art ${className}`} width="384" height="384" loading="lazy" decoding="async" draggable="false" onError={() => setFailed(src)} />
      {children}
    </>
  );
}
