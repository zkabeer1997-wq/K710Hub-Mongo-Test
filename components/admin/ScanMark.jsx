import './scan-mark.css';
import { describeBackpackSnapshot, scanDifference } from '../../lib/backpackScan.mjs';

/**
 * Minimal admin marker for numbers a member filled from a backpack scan: a "Scanned" tag (the full breakdown is on hover and
 * in the details), and a visible hint where the typed number differs from the scanned one by more than 10 percent.
 * Ranking never reads this: the scheduler keeps using the typed/filled fields.
 */
export default function ScanMark({ row, fields }) {
  const snapshot = row && typeof row.backpack_scan === 'object' ? row.backpack_scan : null;
  if (!snapshot) return null;
  const sources = row.backpack_sources || {};
  const scanned = fields.some((f) => sources[f] === 'scan');
  const diffs = fields.map((f) => ({ f, d: scanDifference(f, row[f], snapshot) })).filter((x) => x.d);
  if (!scanned && !diffs.length) return null;
  const breakdown = describeBackpackSnapshot(snapshot);
  return (
    <span className="admin-scan-mark">
      {scanned ? <span className="admin-scan-tag" title={breakdown}>Scanned</span> : null}
      {diffs.map(({ f, d }) => (
        <span key={f} className="admin-scan-diff" title={breakdown}>typed {String(row[f])}, scan said {Math.round(d.scanned * 100) / 100}</span>
      ))}
      <details className="admin-scan-details"><summary>Backpack</summary><span>{breakdown}</span></details>
    </span>
  );
}
