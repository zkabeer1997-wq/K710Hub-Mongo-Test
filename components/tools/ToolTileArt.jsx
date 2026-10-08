'use client';

import { useEffect, useRef, useState } from 'react';
import Icon from '../ui/icons';

// The visual on a Tools & Calculators tile: the admin's custom image when one is
// set, otherwise (or if the image fails to load) the built-in icon.
export default function ToolTileArt({ title, iconName, image = null }) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const ref = useRef(null);
  const url = image?.url || '';
  useEffect(() => {
    setFailed(false); setLoaded(false);
    const el = ref.current;
    // The image may finish (or fail) before React attaches the handlers.
    if (el?.complete) { if (el.naturalWidth > 0) setLoaded(true); else setFailed(true); }
  }, [url]);
  if (!url || failed) {
    return <span className="tool-box-icon" aria-hidden="true"><Icon name={iconName} size={26} /></span>;
  }
  return (
    <span className={`tool-box-icon is-custom${loaded ? ' is-loaded' : ''}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img ref={ref} src={url} alt={image.alt || title} width={64} height={64} loading="lazy" decoding="async" onLoad={() => setLoaded(true)} onError={() => setFailed(true)} />
    </span>
  );
}
