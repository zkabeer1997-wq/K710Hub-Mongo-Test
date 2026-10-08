'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

export default function GalleryCarousel({ images, embedded = false }) {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const touchStart = useRef(null);

  useEffect(() => {
    if (paused || images.length < 2) return undefined;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) return undefined;
    const timer = window.setInterval(() => setActive((current) => (current + 1) % images.length), 5500);
    return () => window.clearInterval(timer);
  }, [images.length, paused]);

  if (!images.length) return null;
  const previous = () => setActive((current) => (current - 1 + images.length) % images.length);
  const next = () => setActive((current) => (current + 1) % images.length);

  return (
    <section className={`home-gallery${embedded ? ' is-embedded' : ''}`} aria-label={embedded ? 'Kingdom 710 gallery' : undefined} aria-labelledby={embedded ? undefined : 'home-gallery-title'} onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      {!embedded && (
        <div className="home-gallery-heading">
          <div>
            <h2 id="home-gallery-title">Life in Kingdom 710</h2>
            <p>Recent moments shared by the kingdom.</p>
          </div>
          <Link href="/gallery">View the gallery →</Link>
        </div>
      )}
      {embedded && <Link href="/gallery" className="home-gallery-embedded-link">View gallery ↗</Link>}

      <div
        className="home-gallery-stage"
        onTouchStart={(event) => { touchStart.current = event.touches[0]?.clientX ?? null; }}
        onTouchEnd={(event) => {
          if (touchStart.current == null) return;
          const distance = (event.changedTouches[0]?.clientX ?? touchStart.current) - touchStart.current;
          if (Math.abs(distance) > 45) distance > 0 ? previous() : next();
          touchStart.current = null;
        }}
      >
        {images.map((image, index) => (
          <figure
            key={image.id}
            className={index === active ? 'is-active' : ''}
            aria-hidden={index !== active}
            style={{ '--gallery-image': `url("${image.image_url.replace(/["\\]/g, '')}")` }}
          >
            <Image
              src={image.image_url}
              alt={index === active ? image.alt_text : ''}
              fill
              unoptimized
              sizes="(max-width: 980px) 100vw, 55vw"
              priority={index === 0}
              loading={index === 0 ? undefined : 'lazy'}
            />
            {!embedded && (image.title || image.caption) && (
              <figcaption>
                {image.title && <strong>{image.title}</strong>}
                {image.caption && <span>{image.caption}</span>}
              </figcaption>
            )}
          </figure>
        ))}
        {images.length > 1 && (
          <>
            <button type="button" className="home-gallery-arrow previous" onClick={previous} aria-label="Previous gallery image">←</button>
            <button type="button" className="home-gallery-arrow next" onClick={next} aria-label="Next gallery image">→</button>
          </>
        )}
      </div>

      {images.length > 1 && (
        <div className="home-gallery-dots" role="group" aria-label="Choose gallery image">
          {images.map((image, index) => (
            <button key={image.id} type="button" className={index === active ? 'is-active' : ''} onClick={() => setActive(index)} aria-label={`Show image ${index + 1}`} aria-current={index === active ? 'true' : undefined} />
          ))}
        </div>
      )}
    </section>
  );
}
