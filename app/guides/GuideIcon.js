'use client';

import { useEffect, useRef, useState } from 'react';

const MARKS = ['I', 'II', 'III', 'IV', 'V', 'VI'];

// The picture is decorative (the title sits right beside it), so alt is empty. If it cannot load
// (Drive down, file deleted: the url answers with an error status) the book icon comes back.
function GuidePicture({ src, onFail }) {
  const ref = useRef(null);
  // A failure can happen before React attaches onError during hydration; check the finished state once.
  useEffect(() => { const el = ref.current; if (el && el.complete && el.naturalWidth === 0) onFail(); }, [onFail]);
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img ref={ref} className="guide-photo" src={src} alt="" width="112" height="112" loading="lazy" decoding="async" onError={onFail} />
  );
}

export default function GuideIcon({ index, imageUrl = '' }) {
  const [failedUrl, setFailedUrl] = useState('');
  const marks = MARKS;
  const showPicture = Boolean(imageUrl) && failedUrl !== imageUrl;
  return (
    <span className="guide-device" aria-hidden="true">
      {showPicture ? <GuidePicture key={imageUrl} src={imageUrl} onFail={() => setFailedUrl(imageUrl)} /> : (
      <svg className="guide-book" viewBox="0 0 120 120">
        <defs>
          <linearGradient id={`guideLeather${index}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#6e5430" />
            <stop offset="55%" stopColor="#382818" />
            <stop offset="100%" stopColor="#1c160f" />
          </linearGradient>
        </defs>
        <path d="M27 18 H88 C95 18 100 23 100 30 V92 C100 98 95 102 89 102 H27 C22 102 18 98 18 93 V27 C18 22 22 18 27 18 Z" fill={`url(#guideLeather${index})`} stroke="#b78c42" strokeWidth="2.5" />
        <path d="M29 25 H88 C91 25 93 27 93 30 V91 C93 94 91 96 88 96 H29 Z" fill="none" stroke="rgba(226,190,110,.42)" strokeWidth="1.5" />
        <path d="M29 18 V102" stroke="#c69a4b" strokeWidth="5" opacity=".55" />
        <path d="M43 42 H80 M43 55 H80 M43 68 H72" stroke="#d6bc82" strokeWidth="3" strokeLinecap="round" opacity=".65" />
        <circle cx="61" cy="82" r="11" fill="#21180f" stroke="#c9a44e" strokeWidth="2" />
        <text x="61" y="86" textAnchor="middle" fontFamily="Georgia, serif" fontSize="11" fill="#e7c978">{marks[index % marks.length]}</text>
      </svg>
      )}
      <span className="guide-device-glow" />
    </span>
  );
}
