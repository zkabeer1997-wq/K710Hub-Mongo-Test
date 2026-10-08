import Link from 'next/link';
import { resultUnavailableMessage } from '../../lib/memberResults.mjs';

// Calm page body for a result page (My appointment / My Noble Advisor appointment) while the
// form that owns it is closed. Server component; no schedule data is loaded for it.
export default function ResultUnavailable({ kind }) {
  return (
    <div className="event-form-card appt-card" role="status">
      <p className="appt-lede">{resultUnavailableMessage(kind)}</p>
      <p><Link className="appt-link" href="/dashboard">Back to my dashboard</Link></p>
    </div>
  );
}
