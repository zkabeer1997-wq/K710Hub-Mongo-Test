'use client';

import Link from 'next/link';
import DualTime from '../ui/DualTime';
import { FORM_PLAIN, formDisplayState } from '../../lib/memberForms.mjs';
import styles from './MemberDashboard.module.css';

// "My forms" list for the dashboard. `forms` arrive already ordered by the ongoing cycle
// (/api/member-form-status). Every status is icon + text, never colour only.
const GLYPH = { todo: '●', carry: '↻', done: '✓', soon: '◷', closed: '⊘' };
const DEADLINE_PREFIX = { closes: 'Closes', cycle: 'Cycle ends', opens: 'Opens' };

function Row({ form }) {
  const st = formDisplayState(form);
  const btn = st.button;
  const deadline = form.deadline;
  return (
    <li className={styles.formRow} data-state={st.id}>
      <div className={styles.formMain}>
        <h3>{form.label}</h3>
        <p>{FORM_PLAIN[form.key] || ''}</p>
        {form.appointmentsSummary?.length > 0 && (
          <p>Your appointment: {form.appointmentsSummary.join('; ')}. <Link href="/forms/kvk-appointments" prefetch={false}>My appointment</Link></p>
        )}
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
  const todo = forms.filter((f) => f.needsInput).length;
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
            {forms.map((form) => <Row key={form.key} form={form} />)}
          </ul>
        </>
      )}
    </section>
  );
}
