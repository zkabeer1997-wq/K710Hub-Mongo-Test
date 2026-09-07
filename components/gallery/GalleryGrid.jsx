'use client';

import { useEffect, useRef, useState } from 'react';

export default function GalleryGrid({ images }) {
  const [selected, setSelected] = useState(null);
  const dialogRef = useRef(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (selected && !dialog.open) dialog.showModal();
    if (!selected && dialog.open) dialog.close();
  }, [selected]);

  return (
    <>
      {/* CSS multi-column layout balances items across up to 3 columns
          regardless of how many images exist, so 1-2 images leave large
          empty columns beside/below them. Cap the column count to the
          number of images so it never reserves more columns than needed. */}
      <div className="gallery-grid" style={{ columns: `${Math.max(1, Math.min(3, images.length))} 290px` }}>
        {images.map((image) => (
          <button key={image.id} type="button" className="gallery-item" onClick={() => setSelected(image)} aria-label={`Open ${image.title || image.alt_text}`}>
            <img src={image.image_url} alt={image.alt_text} loading="lazy" />
            {(image.title || image.caption) && (
              <span><strong>{image.title}</strong>{image.caption && <small>{image.caption}</small>}</span>
            )}
          </button>
        ))}
      </div>
      <dialog ref={dialogRef} className="gallery-lightbox" onClose={() => setSelected(null)} onClick={(event) => { if (event.target === event.currentTarget) setSelected(null); }}>
        {selected && (
          <div>
            <button type="button" className="gallery-lightbox-close" onClick={() => setSelected(null)} aria-label="Close image">×</button>
            <img src={selected.image_url} alt={selected.alt_text} />
            {(selected.title || selected.caption) && <p><strong>{selected.title}</strong>{selected.caption && <span>{selected.caption}</span>}</p>}
          </div>
        )}
      </dialog>
    </>
  );
}

