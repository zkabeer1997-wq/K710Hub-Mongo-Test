'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import DualTime from '../ui/DualTime';
import { FORM_PLAIN, formDisplayState } from '../../lib/memberForms.mjs';
import { withResults, todoCount, resultSeenKey, isResultNew } from '../../lib/memberResults.mjs';
import styles from './MemberDashboard.module.css';

// "My forms" list for the dashboard. `forms` arrive already ordered by the ongoing cycle
// (/api/member-form-status). Every status is icon + text, never colour only.
const GLYPH = { todo: '●', carry: '↻', done: '✓', soon: '◷', closed: '⊘' };
const DEADLINE_PREFIX = { closes: 'Closes', cycle: 'Cycle ends', opens: 'Opens' };

const RESULT_BUTTON = { placed: 'See my appointment', not_placed: 'See my appointment', waiting: 'Open', needs_form: 'Open', not_asked: 'Open' };

function readSeen(result) {
  try { return window.localStorage.getItem(resultSeenKey(result)) === '1'; } catch { return false; }
}

// A RESULT row (what leadership decided), not a form: calendar glyph and "Result" label, no "To do" dot.
function ResultRow({ result }) {
  const [seen, setSeen] = useState(true);
  useEffect(() => { setSeen(readSeen(result)); }, [result]);
  const fresh = isResultNew(result, seen);
  return (
    <li className={`${styles.formRow} ${styles.resultRow}`} data-state="result" data-new={fresh ? 'true' : undefined}>
      <div className={styles.formMain}>
        <h3>{result.label}</h3>
        {fresh && <p className={styles.resultNew}>New: your appointment is ready</p>}
        {result.lines.length > 0 ? (
          <ul className={styles.resultLines}>{result.lines.map((line) => <li key={line}>{line}<AppointmentLocal line={line} /></li>)}</ul>
        ) : (
          <p>{result.message}</p>
        )}
      </div>
      <div className={styles.formMeta}>
        <span className={styles.formStatus} data-state="result"><span aria-hidden="true">📅</span>Result</span>
      </div>
      <Link href={result.href} prefetch={false} className={`${styles.formBtn} ${result.ready ? '' : styles.formBtnQuiet}`}>
        {RESULT_BUTTON[result.state] || 'Open'}<span className="sr-only">: {result.label}</span>
      </Link>
    </li>
  );
}

// The local time next to a UTC line, added after mount so the server render is UTC only.
function AppointmentLocal({ line }) {
  const [local, setLocal] = useState('');
  useEffect(() => {
    const m = /(?:^|: )(?:([A-Z][a-z]{2}) (\d{1,2}), )?(\d{2}:\d{2}) UTC$/.exec(line);
    if (!m) return;
    const [, mon, day, hhmm] = m;
    const now = new Date();
    const monthIndex = mon ? ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].indexOf(mon) : now.getUTCMonth();
    const at = new Date(Date.UTC(now.getUTCFullYear(), monthIndex, mon ? Number(day) : now.getUTCDate(), Number(hhmm.slice(0, 2)), Number(hhmm.slice(3))));
    try { setLocal(new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(at)); } catch { setLocal(''); }
  }, [line]);
  return local ? <span> ({local} your time)</span> : null;
}

function Row({ form }) {
  const st = formDisplayState(form);
  const btn = st.button;
  const deadline = form.deadline;
  return (
    <li className={styles.formRow} data-state={st.id}>
      <div className={styles.formMain}>
        <h3>{form.label}</h3>
        <p>{FORM_PLAIN[form.key] || ''}</p>
      </div>
      <div className={styles.formMeta}>
        <span className={styles.formStatus} data-state={st.id}><span aria-hidden="true">{GLYPH[st.id]}</span>{st.label}</span>
        {deadline && (
          <span className={styles.formDeadline}>
            {DEADLINE_PREFIX[deadline.kind]} <DualTime value={new Date(deadline.at).toISOString()} />
          </span>
        )}
      </div>
      {btn.disabled ? (
        <span className={`${styles.formBtn} ${styles.formBtnOff}`} aria-disabled="true">{btn.text}</span>
      ) : (
        <Link href={form.href} prefetch={false} className={`${styles.formBtn} ${btn.quiet ? styles.formBtnQuiet : ''}`}>
          {btn.text}<span className="sr-only">: {form.label}</span>
        </Link>
      )}
    </li>
  );
}

export default function MyFormsList({ status, loaded }) {
  const forms = status?.forms || [];
  const results = status?.results || [];
  const todo = todoCount(forms);
  const rows = withResults(forms, results);
  return (
    <section className={styles.panel} aria-labelledby="my-forms-title">
      <div className={styles.panelHead}>
        <h2 id="my-forms-title">My forms{todo > 0 ? <span> · {todo} to do</span> : null}</h2>
        <Link href="/forms" className={styles.textLink}>All forms</Link>
      </div>
      {!loaded ? (
        <p className={styles.note} role="status">Loading your forms…</p>
      ) : !status?.signedIn || status?.degraded ? (
        <p className={styles.note} role="status">We could not load your forms just now. <Link href="/forms">Open the forms page</Link> or try again in a moment.</p>
      ) : forms.length === 0 ? (
        <p className={styles.note}>No forms are listed right now.</p>
      ) : (
        <>
          {todo === 0 && <p className={styles.caughtUp} role="status"><span aria-hidden="true">✓</span> You are all caught up. You can still open a form to change your answers.</p>}
          <ul className={styles.formList}>
            {rows.map((item) => (item.kind === 'result' ? <ResultRow key={item.key} result={item} /> : <Row key={item.key} form={item} />))}
          </ul>
        </>
      )}
    </section>
  );
}
