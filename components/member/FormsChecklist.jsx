'use client';

import Link from 'next/link';
import { useMemberFormStatus } from '../../lib/useMemberFormStatus';
import DualTime from '../ui/DualTime';
import { FORM_PLAIN, formDisplayState } from '../../lib/memberForms.mjs';
import { NOTHING_OPEN_MESSAGE } from '../../lib/memberResults.mjs';
import styles from './FormsChecklist.module.css';

// One flat to-do list of every member form, grouped by event, with a plain
// state for each ("Done", "To do", "Closed", "Opens Oct 20") and one obvious
// button. Replaces the two-level forms hub so nobody has to guess where a form
// lives or whether they already filled it in for THIS cycle.

// One source of truth for the plain-language text (also used on the dashboard).
export const PLAIN = FORM_PLAIN;

const GROUPS = [
  { id: 'kvk', title: 'KvK', intro: 'The kingdom-versus-kingdom battle.', keys: ['joiner', 'prep'], cycle: true },
  { id: 'dragon', title: 'Flamedragon Tyrant', intro: 'The Flamedragon Tyrant event.', keys: ['dragon', 'noble'], cycle: true },
  { id: 'votes', title: 'Event votes', intro: 'Short votes. They only open on certain days.', keys: ['swordland', 'tri-alliance'] },
  { id: 'always', title: 'Any time', intro: 'You do not need to redo these for every event.', keys: ['lead'] },
];

const STATE_LOOK = {
  closed: { icon: '🔒', cls: styles.sClosed },
  soon: { icon: '⏳', cls: styles.sSoon },
  done: { icon: '✓', cls: styles.sDone },
  carry: { icon: '↻', cls: styles.sCarry },
  todo: { icon: '●', cls: styles.sTodo },
};

function stateOf(form) {
  const st = formDisplayState(form);
  return { ...st, ...STATE_LOOK[st.id] };
}

function buttonFor(st) {
  return st.button;
}

function Row({ form }) {
  const st = stateOf(form);
  const btn = buttonFor(st);
  const todo = st.id === 'todo' || st.id === 'carry';
  let hint = null;
  if (st.id === 'carry') hint = `We filled this in from your answers last time${form.previousLabel ? ` (${form.previousLabel})` : ''}. Please check them and press Save.`;
  else if (st.id === 'done' && form.updatedAt) hint = <>Saved <DualTime value={form.updatedAt} />.</>;
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

const RESULT_BUTTON = { placed: 'See my appointment', not_placed: 'See my appointment' };

// Results are not forms: a "Result" label, no To do state, own sentence.
function ResultItem({ result }) {
  return (
    <li className={`${styles.item} ${styles.itemResult}`}>
      <div className={styles.itemMain}>
        <div className={styles.itemTop}>
          <h3 className={styles.title}>{result.label}</h3>
          <span className={`${styles.status} ${styles.sResult}`}><span aria-hidden="true">📅</span>Result</span>
        </div>
        {result.lines.length > 0 ? (
          <ul className={styles.resultLines}>{result.lines.map((line) => <li key={line}>{line}</li>)}</ul>
        ) : (
          <p className={styles.desc}>{result.message}</p>
        )}
      </div>
      <Link href={result.href} className={`${styles.bigBtn} ${result.ready ? '' : styles.quietBtn}`}>
        {RESULT_BUTTON[result.state] || 'Open'}<span className="sr-only">: {result.label}</span>
      </Link>
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
  // `forms` arrives already ordered by the ongoing cycle; groups follow the first form they hold.
  const position = Object.fromEntries(forms.map((f, i) => [f.key, i]));
  const orderedGroups = GROUPS
    .map((group) => ({ group, rows: forms.filter((f) => group.keys.includes(f.key)) }))
    .filter(({ rows }) => rows.length > 0)
    .sort((a, b) => position[a.rows[0].key] - position[b.rows[0].key]);
  const todo = forms.filter((f) => f.needsInput);
  const resultsFor = (group) => (status.results || []).filter((r) => r.group === group.id);
  const first = status.firstIncomplete;
  return (
    <div className={styles.wrap}>
      <section className={`${styles.summary} ${todo.length === 0 ? styles.summaryDone : ''}`} aria-live="polite">
        {forms.length === 0 ? (
          <>
            <h2>Nothing to fill in</h2>
            <p>{NOTHING_OPEN_MESSAGE}</p>
          </>
        ) : todo.length > 0 ? (
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

      {orderedGroups.map(({ group, rows }) => {
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
            {resultsFor(group).length > 0 && (
              <>
                <h3 className={styles.resultsHead} id={`r-${group.id}`}>Results</h3>
                <ul className={styles.list} aria-labelledby={`r-${group.id}`}>
                  {resultsFor(group).map((r) => <ResultItem key={r.key} result={r} />)}
                </ul>
              </>
            )}
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
