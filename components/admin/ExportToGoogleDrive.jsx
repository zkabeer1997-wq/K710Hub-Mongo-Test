'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '../ui';

const POPUP_FEATURES = 'width=500,height=600';

/**
 * Google Drive export button, separate from and additional to any
 * existing "Export to Excel" button on the same page — see Phase 7's
 * commit notes for why both exist. `getSheets` is called lazily at
 * click time (same pattern as the existing Excel export functions) so
 * it always exports whatever is currently filtered/visible, not a
 * stale snapshot from render time.
 */
export default function ExportToGoogleDrive({ title, getSheets }) {
  const [status, setStatus] = useState('idle'); // idle | authorizing | exporting | done | error
  const [message, setMessage] = useState('');
  const [sheetUrl, setSheetUrl] = useState('');
  const popupRef = useRef(null);
  const pendingExportRef = useRef(false);

  useEffect(() => {
    function onMessage(event) {
      if (event.origin !== window.location.origin) return;
      if (!event.data || typeof event.data.googleDriveAuthed === 'undefined') return;
      if (popupRef.current && !popupRef.current.closed) popupRef.current.close();
      if (event.data.googleDriveAuthed) {
        if (pendingExportRef.current) {
          pendingExportRef.current = false;
          runExport();
        }
      } else {
        pendingExportRef.current = false;
        setStatus('error');
        setMessage(event.data.error || 'Google sign-in was not completed.');
      }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openAuthPopup() {
    setStatus('authorizing');
    setMessage('Sign in with Google in the popup window…');
    pendingExportRef.current = true;
    const popup = window.open('/api/google-drive/auth', 'k710-google-drive-auth', POPUP_FEATURES);
    popupRef.current = popup;
    if (!popup) {
      pendingExportRef.current = false;
      setStatus('error');
      setMessage('The sign-in popup was blocked. Allow popups for this site and try again.');
    }
  }

  async function runExport() {
    setStatus('exporting');
    setMessage('Building your Google Sheet…');
    try {
      const sheets = getSheets();
      const response = await fetch('/api/export-to-drive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, sheets }),
      });
      const result = await response.json().catch(() => ({}));
      if (response.status === 401 && result?.needsAuth) {
        openAuthPopup();
        return;
      }
      if (!response.ok) throw new Error(result.error || 'Export failed.');
      setStatus('done');
      setMessage('Exported.');
      setSheetUrl(result.url);
    } catch (error) {
      setStatus('error');
      setMessage(error.message || 'Export failed.');
    }
  }

  function handleClick() {
    setSheetUrl('');
    runExport();
  }

  const busy = status === 'authorizing' || status === 'exporting';

  return (
    <div className="export-to-drive">
      <Button variant="quiet" onClick={handleClick} disabled={busy}>
        {status === 'authorizing' ? 'Waiting for sign-in…' : status === 'exporting' ? 'Exporting…' : 'Export to Google Drive'}
      </Button>
      {status === 'done' && sheetUrl && (
        <a href={sheetUrl} target="_blank" rel="noopener noreferrer" className="export-to-drive-link">
          Open in Google Sheets →
        </a>
      )}
      {status === 'error' && <span className="export-to-drive-error">{message}</span>}
      <style jsx>{`
        .export-to-drive{display:inline-flex;align-items:center;gap:10px;flex-wrap:wrap}
        .export-to-drive-link{font-size:12px;color:var(--gold-bright,inherit);text-decoration:underline}
        .export-to-drive-error{font-size:12px;color:#ff8f8f}
      `}</style>
    </div>
  );
}
