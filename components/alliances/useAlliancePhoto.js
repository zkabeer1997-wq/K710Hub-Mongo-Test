'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * State for an alliance photo. `show` is false when there is no url or the file failed to load
 * (Drive down, file deleted: the url answers with an error status because of ?fallback=none); the
 * caller then renders the no-photo look. Render the picture with <AlliancePhotoImg onFail={fail}>.
 */
export default function useAlliancePhoto(url) {
  const [failedUrl, setFailedUrl] = useState('');
  const fail = useCallback(() => setFailedUrl(url), [url]);
  return { show: Boolean(url) && failedUrl !== url, fail };
}

/** The photo <img> (16:9, explicit size so nothing shifts). A failure can happen before React attaches onError during hydration, so the finished image is checked once after mount. */
export function AlliancePhotoImg({ src, alt, className, eager = false, onFail }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (el && el.complete && el.naturalWidth === 0) onFail();
  }, [src, onFail]);
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={ref} className={className} src={src} alt={alt || ''} width="1600" height="900"
      loading={eager ? 'eager' : 'lazy'} {...(eager ? { fetchPriority: 'high' } : {})} decoding="async" onError={onFail}
    />
  );
}
