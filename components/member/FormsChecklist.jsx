'use client';

import Link from 'next/link';
import { useMemberFormStatus } from '../../lib/useMemberFormStatus';
import DualTime from '../ui/DualTime';
import styles from './FormsChecklist.module.css';

// One flat to-do list of every member form, grouped by event, with a plain
// state for each ("Done", "To do", "Closed", "Opens Oct 20") and one obvious
// button. Replaces the two-level forms hub so nobody has to guess where a form
// lives or whether they already filled it in for THIS cycle.

const PLAIN = {
  lead: 'Your gear, charms, pets and power. Update it whenever something changes. It does not reset between events.',
  joiner: 'When you can play during KvK, plus your troop levels and heroes for this KvK.',
  prep: 'What you can use during the KvK preparation days.',
  appointments: 'Ask for a minister or advisor buff time slot.',
  dragon: 'Your troops and heroes for Flamedragon Tyrant.',
  noble: 'Book a time for troop training with the Noble Advisor.',
  swordland: 'Vote on how you will take part in Swordland Summit.',
  'tri-alliance': 'Vote on how you will take part in Tri-Alliance Clash.',
};

const GROUPS = [
  { id: 'kvk', title: 'KvK', intro: 'The kingdom-versus-kingdom battle.', keys: ['joiner', 'prep', 'appointments'], cycle: true },
  { id: 'dragon', title: 'Flamedragon Tyrant', intro: 'The Flamedragon Tyrant event.', keys: ['dragon', 'noble'], cycle: true },
  { id: 'votes', title: 'Event votes', intro: 'Short votes. They only open on certain days.', keys: ['swordland', 'tri-alliance'] },
  { id: 'always', title: 'Any time', intro: 'You do not need to redo these for every event.', keys: ['lead'] },
];

function stateOf(form) {
  if (form.state === 'closed') return { id: 'closed', label: 'Closed', icon: '🔒', cls: styles.sClosed };
  if (form.state === 'upcoming') return { id: 'soon', label: form.badge || 'Opens soon', icon: '⏳', cls: styles.sSoon };
  if (form.submitted) return { id: 'done', label: 'Done', icon: '✓', cls: styles.sDone };
  if (form.carriedOver) return { id: 'carry', label: 'Check and save', icon: '↻', cls: styles.sCarry };
  return { id: 'todo', label: 'To do', icon: '●', cls: styles.sTodo };
}

function buttonFor(st, form) {
  if (st.id === 'closed') return { text: 'Closed', disabled: true };
  if (st.id === 'soon') return { text: 'Not open yet', disabled: true };
  if (st.id === 'done') return { text: 'Change my answers', quiet: true };
  if (st.id === 'carry') return { text: 'Check and save', primary: true };
  return { text: form.key === 'lead' ? 'Open' : 'Fill in', primary: true };
}

function Row({ form }) {
  const st = stateOf(form);
  const btn = buttonFor(st, form);
  const todo = st.id === 'todo' || st.id === 'carry';
  let hint = null;
  if (st.id === 'carry') hint = `We filled this in from your answers last time${form.previousLabel ? ` (${form.previousLabel})` : ''}. Please check them and press Save.`;
  else if (st.id === 'done' && form.updatedAt) hint = <>Saved <DualTime value={form.updatedAt} />.{form.appliedTitles ? ` Applied for: ${form.appliedTitles}.` : ''}</>;
  else if (st.id === 'soon' && form.opensAt) hint = <>Opens <DualTime value={new Date(form.opensAt).toISOString()} />.</>;
  else if (st.id === 'closed') hint = 'This form is not taking answers right now.';
  else if (form.closesAt && form.state === 'open') hint = <>Closes <DualTime value={new Date(form.closesAt).toISOString()} />.</>;
  return (
    <li className={`${styles.item} ${todo ? styles.itemTodo : ''}`}>
      <div className={styles.itemMain}>
        <div className={styles.itemTop}>
          <h3 className={styles.title}>{form.label}</h3>
          <span className={`${styles.status} ${st.cls}`}><span aria-hidden="true">{st.icon}</span>{st.label}</span>
        </div>
        <p className={styles.desc}>{PLAIN[form.key] || ''}</p>
        {hint && <p className={styles.hint}>{hint}</p>}
      </div>
      {btn.disabled ? (
        <span className={`${styles.bigBtn} ${styles.disabledBtn}`} aria-disabled="true">{btn.text}</span>
      ) : (
        <Link href={form.href} className={`${styles.bigBtn} ${btn.quiet ? styles.quietBtn : ''}`}>
          {btn.text}<span className="sr-only">: {form.label}</span>
        </Link>
      )}
    </li>
  );
}

export default function FormsChecklist() {
  const { status, loaded } = useMemberFormStatus();
  if (!loaded) return <p className={styles.loading} role="status">Loading your list…</p>;
  if (!status.signedIn) {
    return (
      <div className={styles.summary}>
        <h2>Please sign in first</h2>
        <p>Your list of forms is shown after you sign in.</p>
        <Link href="/login?next=/forms" className={styles.bigBtn}>Sign in</Link>
      </div>
    );
  }
  const forms = status.forms || [];
  const byKey = Object.fromEntries(forms.map((f) => [f.key, f]));
  const todo = forms.filter((f) => f.needsInput);
  const first = status.firstIncomplete;
  return (
    <div className={styles.wrap}>
      <section className={`${styles.summary} ${todo.length === 0 ? styles.summaryDone : ''}`} aria-live="polite">
        {todo.length > 0 ? (
          <>
            <h2>{todo.length === 1 ? '1 thing to do' : `${todo.length} things to do`}</h2>
            <p>Start with the first one. It only takes a few minutes. You can come back at any time.</p>
            {first && <Link href={first.href} className={styles.bigBtn}>Start: {first.label}</Link>}
          </>
        ) : (
          <>
            <h2>You are all caught up</h2>
            <p>There is nothing you need to fill in right now. You can still open a form below to change your answers.</p>
          </>
        )}
      </section>

      {GROUPS.map((group) => {
        const rows = group.keys.map((k) => byKey[k]).filter(Boolean);
        if (rows.length === 0) return null;
        const cycleLabel = group.cycle ? rows.find((r) => r.cycleLabel)?.cycleLabel : null;
        return (
          <section key={group.id} className={styles.group} aria-labelledby={`g-${group.id}`}>
            <div className={styles.groupHead}>
              <h2 id={`g-${group.id}`}>{cycleLabel ? (cycleLabel.toLowerCase().includes(group.title.toLowerCase()) ? cycleLabel : `${group.title} · ${cycleLabel}`) : group.title}</h2>
              <p>{group.intro}{group.cycle ? ' Your answers are saved separately for each round, so you fill these in again every time.' : ''}</p>
            </div>
            <ul className={styles.list}>
              {rows.map((form) => <Row key={form.key} form={form} />)}
            </ul>
          </section>
        );
      })}

      <section className={styles.group} aria-labelledby="g-more">
        <div className={styles.groupHead}><h2 id="g-more">Other</h2></div>
        <ul className={styles.list}>
          <li className={styles.item}>
            <div className={styles.itemMain}>
              <div className={styles.itemTop}><h3 className={styles.title}>Website requests</h3></div>
              <p className={styles.desc}>Suggest an improvement or tell us about a problem with this website. Optional.</p>
            </div>
            <Link href="/forms/requests" className={`${styles.bigBtn} ${styles.quietBtn}`}>Send a request</Link>
          </li>
        </ul>
      </section>
    </div>
  );
}
