'use client';

import { useT } from '../i18n/LanguageProvider';
import './backpack-scan.css';

function shortDate(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  try { return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' }).format(d); } catch { return d.toDateString(); }
}

/**
 * Small note under a form box: "From your backpack scan on <date>" while the box still holds the scanned number, or
 * "You changed this. Your scan said X." after the member edited it. Renders nothing for a box that was never scanned.
 * source: 'scan' | 'typed' | undefined; scanned: the scanned value as text (for the typed case); at: ISO date of the scan.
 */
export default function ScanFieldNote({ source, at, scanned }) {
  const t = useT();
  if (source === 'scan') return <span className="bps-note" data-scan-note="scan">{t('backpack.fieldNote.scan', { date: shortDate(at) })}</span>;
  if (source === 'typed' && scanned) return <span className="bps-note" data-scan-note="typed">{t('backpack.fieldNote.typed', { value: scanned })}</span>;
  return null;
}
