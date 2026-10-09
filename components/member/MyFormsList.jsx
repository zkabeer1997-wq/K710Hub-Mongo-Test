'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Icon from '../ui/icons';
import { dashT as t } from './dashboardCopy.mjs';
import { FORM_PLAIN } from '../../lib/memberForms.mjs';
import { resultSeenKey, isResultNew } from '../../lib/memberResults.mjs';
import {
  FORM_TEXT, buildHome, cardDate, formatDay, formatWhen,
} from './memberHome.mjs';
import styles from './MemberDashboard.module.css';

// "My forms" card for the dashboard. `forms` arrive already ordered/filtered by /api/member-form-status
// (only open forms). Every status is icon + text, never colour only.
const CHIP = {
  todo: { icon: 'alert', key: 'formStatus.todo' },
  carry: { icon: 'alert', key: 'formStatus.carry' },
  done: { icon: 'check', key: 'formStatus.done' },
  closed: { icon: 'clock', key: 'formStatus.closed' },
  soon: { icon: 'clock', key: 'formStatus.soon' },
};
const BUTTON = { todo: 'formButton.fill', carry: 'formButton.check', done: 'formButton.change' };

function readSeen(result) {
  try { return window.localStorage.getItem(resultSeenKey(result)) === '1'; } catch { return false; }
}

// A RESULT row (what leadership decided), not a form: calendar glyph and "Result" label, no "To do" dot.
function ResultRow({ result, t }) {
  const [seen, setSeen] = useState(true);
  useEffect(() => { setSeen(readSeen(result)); }, [result]);
  const fresh = isResultNew(result, seen);
  return (
    <li className={`${styles.formRow} ${styles.resultRow}`} data-state="result" data-new={fresh ? 'true' : undefined}>
      <div className={styles.formMain}>
        <h3>{result.label}</h3>
        {fresh && <p className={styles.resultNew}>{t('dash.result.new')}</p>}
        {result.lines.length > 0 ? (
          <ul className={styles.resultLines}>{result.lines.map((line) => <li key={line}>{line}<AppointmentLocal line={line} /></li>)}</ul>
        ) : (
          <p>{result.message}</p>
        )}
      </div>
      <div className={styles.formMeta}>
        <span className={styles.formStatus} data-state="result"><Icon name="calendar" size={16} />{t('dash.result.label')}</span>
      </div>
      <Link href={result.href} prefetch={false} className={`${styles.formBtn} ${result.ready ? '' : styles.formBtnQuiet}`}>
        {t(result.ready ? 'dash.result.see' : 'dash.result.open')}<span className="sr-only">: {result.label}</span>
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
  return local ? <span> ({local})</span> : null;
}

function Chip({ state, t }) {
  const chip = CHIP[state] || CHIP.todo;
  return (
    <span className={styles.formStatus} data-state={state}><Icon name={chip.icon} size={16} />{t(chip.key)}</span>
  );
}

function DateLine({ form, language, t }) {
  if (form.card === 'done' && form.updatedAt) return <span className={styles.formDeadline}>{t('form.saved', { date: formatDay(form.updatedAt, language) })}</span>;
  const date = cardDate(form);
  if (date.kind === 'before') return <span className={styles.formDeadline}>{t('form.date.before', { date: formatWhen(date.at, language) })}</span>;
  if (date.kind === 'opens') return <span className={styles.formDeadline}>{t('form.date.opens', { date: formatWhen(date.at, language) })}</span>;
  return <span className={styles.formDeadline}>{t('form.date.none')}</span>;
}

// One form row: number badge, title, one helper line, status chip, one date line, one action.
function FormRow({ form, language, t }) {
  const text = FORM_TEXT[form.key];
  const title = text ? t(text.title) : form.label;
  const help = text ? t(text.help) : FORM_PLAIN[form.key] || '';
  const textKey = BUTTON[form.card];
  const quiet = form.card === 'done';
  return (
    <li className={styles.formRow} data-state={form.card}>
      <div className={styles.formMain}>
        <h3>{form.number ? <span className={styles.formNum} aria-hidden="true">{form.number}</span> : null}{title}</h3>
        {help && <p>{help}</p>}
      </div>
      <div className={styles.formMeta}>
        <Chip state={form.card} t={t} />
        <DateLine form={form} language={language} t={t} />
      </div>
      {textKey ? (
        <Link href={form.href} prefetch={false} className={`${styles.formBtn} ${quiet ? styles.formBtnQuiet : ''}`}>
          {t(textKey)}{!quiet && <Icon name="arrow" size={18} />}<span className="sr-only">: {title}</span>
        </Link>
      ) : (
        <span className={`${styles.formBtn} ${styles.formBtnOff}`} aria-disabled="true">{t('formButton.closed')}</span>
      )}
    </li>
  );
}

// "My forms": exactly the four member forms (numbered, fixed order) while their gates are open, then an
// "Also open now" strip (event votes + appointment results), then Power Profile as its own optional row.
export default function MyFormsList({ status, loaded }) {
  const language = undefined; // browser locale for dates
  const home = buildHome(status);
  const signedOut = !status?.signedIn || status?.degraded;
  const nothing = home.cards.length === 0 && home.extras.length === 0 && home.results.length === 0;
  const power = home.power;
  return (
    <div className={styles.formsCol}>
      <section className={styles.panel} aria-labelledby="my-forms-title">
        <div className={styles.panelHead}>
          <h2 id="my-forms-title">My forms{home.left > 0 ? <span> · {home.left} to do</span> : null}</h2>
          <Link href="/forms" className={styles.textLink}>{t('dash.more.allForms')}</Link>
        </div>
        {!loaded ? (
          <p className={styles.note} role="status">{t('dash.loading')}</p>
        ) : signedOut ? (
          <p className={styles.note} role="status">{t('dash.loadError')} <Link href="/forms">{t('dash.loadErrorLink')}</Link></p>
        ) : nothing ? (
          <p className={styles.note} role="status">{t('dash.nothingOpen')}</p>
        ) : (
          <>
            {home.left === 0 && <p className={styles.caughtUp} role="status"><Icon name="check" size={16} /> {t('dash.allDone')} {t('dash.allDoneHint')}</p>}
            {home.cards.length > 0 && (
              <ol className={styles.formList} aria-label={t('dash.formsHeading')}>
                {home.cards.map((form) => <FormRow key={form.key} form={form} language={language} t={t} />)}
              </ol>
            )}
            {(home.extras.length > 0 || home.results.length > 0) && (
              <div className={styles.alsoOpen}>
                <h3 className={styles.alsoHead}>{t('dash.alsoOpen')}</h3>
                <ul className={styles.formList}>
                  {home.extras.map((form) => <FormRow key={form.key} form={form} language={language} t={t} />)}
                  {home.results.map((result) => <ResultRow key={result.key} result={result} t={t} />)}
                </ul>
              </div>
            )}
          </>
        )}
      </section>
      {loaded && !signedOut && (
        <Link href="/power-profile" prefetch={false} className={styles.powerRow}>
          <Icon name="shield" size={20} />
          <span className={styles.powerText}><strong>{t('dash.power.title')}</strong><span>{t('dash.power.help')}</span></span>
          {power?.submitted && <Chip state="done" t={t} />}
          <Icon name="arrow" size={18} />
        </Link>
      )}
    </div>
  );
}
