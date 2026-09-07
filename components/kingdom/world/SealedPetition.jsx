'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';

/**
 * THE SEALED PETITION
 *
 * Submission reward sequence. Runs after the interest form POSTs
 * successfully, so it never gates or delays the actual write.
 *
 * Beats: parchment settles -> seal descends and presses -> gold flash
 * through the crest -> document rolls -> courier carries it toward the
 * fortress. Skippable throughout; reduced motion jumps to the result.
 */
export default function SealedPetition({ onClose, reducedMotion = false, intakePeriod, discordUsername, reference }) {
  const [beat, setBeat] = useState(reducedMotion ? 4 : 0);
  const timers = useRef([]);

  useEffect(() => {
    if (reducedMotion) return undefined;
    const at = (ms, b) => timers.current.push(setTimeout(() => setBeat(b), ms));
    at(500, 1);   // seal presses
    at(1250, 2);  // gold flash through the crest
    at(2100, 3);  // document rolls, courier departs
    at(3500, 4);  // result copy
    return () => timers.current.forEach(clearTimeout);
  }, [reducedMotion]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') setBeat(4);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="sealed" role="dialog" aria-modal="true" aria-labelledby="sealed-title">
      <div className="sealed-stage" data-beat={beat}>
        {/* the petition itself */}
        <div className="sealed-doc" aria-hidden="true">
          <div className="sealed-doc-lines">
            {Array.from({ length: 9 }).map((_, i) => (
              <span key={i} style={{ width: `${52 + ((i * 37) % 44)}%` }} />
            ))}
          </div>
          <div className="sealed-wax">
            <svg viewBox="0 0 40 40" aria-hidden="true">
              <circle cx="20" cy="20" r="18" fill="#7d1f2a" />
              <circle cx="20" cy="20" r="14" fill="none" stroke="#a83a45" strokeWidth="1" />
              <path
                d="M20 8 L30 12 V21 C30 26 25.5 29.5 20 31 C14.5 29.5 10 26 10 21 V12 Z"
                fill="none"
                stroke="#e8c9a0"
                strokeWidth="1.4"
              />
              <text
                x="20" y="24" textAnchor="middle"
                fontFamily="var(--font-display-loaded), Georgia, serif"
                fontWeight="900" fontSize="9" fill="#e8c9a0"
              >
                710
              </text>
            </svg>
          </div>
          <div className="sealed-flash" />
        </div>

        {/* courier carrying it toward the fortress */}
        <div className="sealed-courier" aria-hidden="true">
          <span className="sealed-courier-body" />
          <span className="sealed-fortress" />
        </div>
      </div>

      <div className={`sealed-copy ${beat >= 4 ? 'is-in' : ''}`}>
        <span className="k-mark">Petition Received</span>
        <h2 id="sealed-title" className="k-display sealed-title">The Council Has Your Name</h2>
        <p className="k-narrative sealed-note">
          Your petition is sealed and carried to the inner kingdom for the{' '}
          {intakePeriod ? <strong>{intakePeriod}</strong> : 'next'} intake window.
          Leadership reviews every application before that window opens
          {discordUsername ? <> and will reach you on Discord as <strong>{discordUsername}</strong></> : ''}.
        </p>
        {reference && (
          <p className="sealed-reference">
            Reference <strong>{reference}</strong> — keep this for your records.
          </p>
        )}
        <p className="k-narrative sealed-wink">We&rsquo;ll see you at the gates.</p>
        <div className="sealed-actions">
          <button type="button" className="k-btn" onClick={onClose}>
            Continue
          </button>
          <Link href="/chronometer" className="k-btn k-btn-quiet">
            Back to the Chamber
          </Link>
        </div>
      </div>

      {beat < 4 && (
        <button type="button" className="sealed-skip k-ui" onClick={() => setBeat(4)}>
          Skip
        </button>
      )}
    </div>
  );
}
