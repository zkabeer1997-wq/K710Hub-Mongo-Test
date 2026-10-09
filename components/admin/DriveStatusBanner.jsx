'use client';

import { useEffect, useState } from 'react';
import styles from './ImageUploadField.module.css';
import { driveBannerVisible } from '../../lib/adminOverview.mjs';

/**
 * Warning strip for admin pages that use images. It renders ONLY when Google
 * Drive is not connected; the healthy "connected as ..." state lives once on
 * Settings > Integrations instead of repeating on every page. Reads
 * GET /api/admin-drive/status. Connection management itself stays in
 * Admin > Gallery. Props: className?
 */
export default function DriveStatusBanner({ className = '' }) {
  const [status, setStatus] = useState(null);
  useEffect(() => {
    let cancelled = false;
    fetch('/api/admin-drive/status', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((s) => { if (!cancelled) setStatus(s); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);
  if (!status) return null;
  if (!driveBannerVisible(status)) return null;
  return (
    <p className={`${styles.banner} ${styles.warn} ${className}`} role="status">
      Google Drive is not connected, so images cannot be uploaded. <a href="/admin/dashboard/gallery">Connect Google Drive in Admin &gt; Gallery</a>.
    </p>
  );
}
