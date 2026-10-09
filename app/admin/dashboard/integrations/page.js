'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import AdminShell from '../../../../components/admin/AdminShell';
import StatusChip from '../../../../components/admin/StatusChip';
import { Button } from '../../../../components/ui';
import { driveHealth, giftCodeHealth } from '../../../../lib/adminOverview.mjs';

// Console surface. One place that says whether the outside services the site
// depends on are healthy. Connecting Google Drive itself still happens in
// Admin > Gallery, so this page only reports and links there.
export default function IntegrationsPage() {
  const [drive, setDrive] = useState(undefined); // undefined = loading, null = unavailable
  const [gifts, setGifts] = useState(undefined);

  useEffect(() => {
    let live = true;
    fetch('/api/admin-drive/status', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null).then((d) => { if (live) setDrive(d); });
    fetch('/api/admin-gift-codes', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null).then((d) => { if (live) setGifts(d ? d.sources || [] : null); });
    return () => { live = false; };
  }, []);

  const driveLine = driveHealth(drive || null);
  const giftLine = giftCodeHealth(gifts || []);
  const chip = (kind) => (kind === 'ok' ? { k: 'open', t: 'Working' } : kind === 'warn' ? { k: 'warn', t: 'Needs attention' } : { k: 'none', t: 'Unknown' });

  return (
    <AdminShell title="Integrations" subtitle="Whether the outside services the site depends on are connected and healthy.">
      <div className="admin-table-wrap">
        <table className="admin-table stack-table">
          <thead>
            <tr>
              <th scope="col">Service</th>
              <th scope="col">Status</th>
              <th scope="col">Details</th>
              <th scope="col"><span className="sr-only">Manage</span></th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row" data-label="Service">Google Drive</th>
              <td data-label="Status">{drive === undefined ? 'Checking...' : <StatusChip kind={chip(driveLine.kind).k}>{chip(driveLine.kind).t}</StatusChip>}</td>
              <td data-label="Details">
                {drive === undefined ? '' : drive?.connected
                  ? `${driveLine.text.replace('Google Drive: ', '')}. Images are saved to the ${drive.rootFolder} folder.`
                  : drive ? 'Not connected, so images cannot be uploaded.' : 'Status could not be read.'}
              </td>
              <td data-label="Manage"><Button variant="quiet" href="/admin/dashboard/gallery" className="ec-btn-sm">{drive?.connected ? 'Manage in Gallery' : 'Connect in Gallery'}</Button></td>
            </tr>
            <tr>
              <th scope="row" data-label="Service">Gift code sources</th>
              <td data-label="Status">{gifts === undefined ? 'Checking...' : <StatusChip kind={chip(giftLine.kind).k}>{chip(giftLine.kind).t}</StatusChip>}</td>
              <td data-label="Details">{gifts === undefined ? '' : gifts === null ? 'Status could not be read.' : giftLine.text.replace('Gift codes: ', '')}</td>
              <td data-label="Manage"><Button variant="quiet" href="/admin/dashboard/gift-codes" className="ec-btn-sm">Open Gift codes</Button></td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="ec-hint">
        Pages that use images only show a Google Drive notice when Drive is <em>not</em> connected.
        {' '}<Link href="/admin/dashboard/overview" className="ec-link">Back to Overview</Link>
      </p>
    </AdminShell>
  );
}
