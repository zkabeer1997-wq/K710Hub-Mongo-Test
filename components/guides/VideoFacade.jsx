'use client';

import { useState } from 'react';
import styles from './guideLayout.module.css';

// Click-to-load video player. Nothing is requested from YouTube or Google
// until the reader clicks (no third-party poster image either). Rendered as a
// real link so it still works with JavaScript disabled. The CSP only frames
// the two hosts below (see proxy.js).
export default function VideoFacade({ provider, embedSrc, href, title, label, allowLoad = true }) {
  const [loaded, setLoaded] = useState(false);
  const name = title || 'Video';
  if (loaded && embedSrc) {
    return (
      <div className={styles.videoFrame}>
        <iframe
          src={embedSrc}
          title={name}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          loading="lazy"
        />
      </div>
    );
  }
  return (
    <a
      className={styles.videoCard}
      data-provider={provider}
      href={href}
      rel="noopener noreferrer"
      target="_blank"
      onClick={event => {
        if (!allowLoad || !embedSrc) return;
        event.preventDefault();
        setLoaded(true);
      }}
    >
      <span className={styles.videoPlay} aria-hidden="true" />
      <span className={styles.videoText}>
        <strong>{title || 'Watch the video'}</strong>
        <small>{label} · click to play here</small>
      </span>
    </a>
  );
}
