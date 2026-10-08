'use client';

import { useRef, useState } from 'react';
import { decodeImageFile } from '../../lib/scan/browser/decodeImage.mjs';
import { buildReviewRows, scanFailureMessage } from '../../lib/scan/review.mjs';

const ACCEPT = 'image/png,image/jpeg,image/webp';

/**
 * Screenshot scan entry: a button plus a drop zone. The picture is decoded in memory, read on this device and thrown away;
 * it is never uploaded or stored. onReview(review) receives buildReviewRows output for a good read.
 */
export default function ScanLauncher({ onReview, disabled = false }) {
  const input = useRef(null);
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  async function scan(file) {
    if (!file || busy) return;
    setError('');
    setBusy(true);
    setStatus('Reading your screenshot...');
    try {
      const decoded = await decodeImageFile(file);
      if (!decoded.ok) { setError(decoded.message); setStatus(''); return; }
      await new Promise((resolve) => { setTimeout(resolve); }); // let the "Reading" text paint before the CPU work
      const { runScan } = await import('../../lib/scan/engine.mjs');
      const result = runScan('governor_profile', decoded.pixels);
      const review = buildReviewRows(result);
      if (!review.ok) { setError(review.message); setStatus(''); return; }
      setStatus('');
      onReview(review);
    } catch {
      setError(scanFailureMessage(null));
      setStatus('');
    } finally {
      setBusy(false);
    }
  }

  function pick(e) {
    const file = e.target.files?.[0];
    e.target.value = ''; // so the same file can be chosen again
    scan(file);
  }
  function drop(e) {
    e.preventDefault();
    setOver(false);
    scan(e.dataTransfer?.files?.[0]);
  }

  return (
    <div className="lo-scan">
      <p className="lo-note" id="lo-scan-note">
        In the game, open Governor Profile (the screen with your six gear pieces and charm gems) and take a screenshot. Add it here.
        The picture stays on your phone and is never saved.
      </p>
      <div
        className="lo-drop"
        data-over={over ? 'true' : undefined}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={drop}
      >
        <button
          type="button"
          className="lo-btn lo-btn-secondary"
          disabled={busy || disabled}
          aria-describedby="lo-scan-note lo-scan-status"
          onClick={() => input.current?.click()}
          onKeyDown={(e) => { if (e.key === 'Enter') e.stopPropagation(); }} // keep the form's Enter guard from swallowing activation
        >
          {busy ? 'Reading...' : 'Scan a screenshot'}
        </button>
        <span className="lo-drop-hint" aria-hidden="true">or drop a screenshot here</span>
        <input ref={input} type="file" accept={ACCEPT} className="lo-sr-only" tabIndex={-1} aria-hidden="true" onChange={pick} />
      </div>
      <p id="lo-scan-status" className="lo-scan-status" role="status" aria-live="polite">{status}</p>
      {error ? <p className="lo-scan-error" role="alert">{error}</p> : null}
    </div>
  );
}
