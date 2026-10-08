'use client';

import { useEffect, useState } from 'react';
import styles from './ImageUploadField.module.css';

/**
 * Small "Google Drive connected" strip for admin pages that use images.
 * Reads GET /api/admin-drive/status. Connection management itself stays in
 * Admin > Gallery. Props: className?, children? (extra actions on the right).
 */
export default function DriveStatusBanner({ className = '' }) {
  const [status, setStatus] = useState(null);
  useEffect(() => {
    let cancelled = false;
    fetch('/api/admin-drive/status', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((s) => { if (!cancelled) setStatus(s); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);
  if (!status) return null;
  if (status.connected) {
    return <p className={`${styles.banner} ${className}`} role="status">Google Drive connected{status.fake ? ' (local test Drive)' : status.email ? ` as ${status.email}` : ''}. Images are saved to the {status.rootFolder} folder.</p>;
  }
  return (
    <p className={`${styles.banner} ${styles.warn} ${className}`} role="status">
      Google Drive is not connected, so images cannot be uploaded. <a href="/admin/dashboard/gallery">Connect Google Drive in Admin &gt; Gallery</a>.
    </p>
  );
}
