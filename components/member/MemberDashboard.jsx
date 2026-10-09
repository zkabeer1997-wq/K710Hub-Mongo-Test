'use client';

import Link from 'next/link';
import { Term } from '../ui';
import Icon from '../ui/icons';
import GiftCodeRewards from '../GiftCodeRewards';
import EasyViewToggle from '../EasyViewToggle';
import LanguageSwitcher from '../i18n/LanguageSwitcher';
import { useLanguage } from '../i18n/LanguageProvider';
import { useMemberFormStatus } from '../../lib/useMemberFormStatus';
import { dashboardLinks } from '../../lib/memberForms.mjs';
import { isDueSoon } from '../../lib/deadlines.mjs';
import {
  FORM_TEXT, buildHome, cardDate, formatDay, formatWhen,
} from './memberHome.mjs';
import styles from './MemberDashboard.module.css';

const CHIP = {
  todo: { icon: 'alert', key: 'formStatus.todo' },
  carry: { icon: 'alert', key: 'formStatus.carry' },
  done: { icon: 'check', key: 'formStatus.done' },
  closed: { icon: 'clock', key: 'formStatus.closed' },
  soon: { icon: 'clock', key: 'formStatus.soon' },
};
const BUTTON = { todo: 'formButton.fill', carry: 'formButton.check', done: 'formButton.change' };

function formatNumber(value) {
  return value == null || value === '' ? '—' : new Intl.NumberFormat().format(value);
}

function Chip({ state, t }) {
  const chip = CHIP[state] || CHIP.todo;
  return (
    <span className={styles.chip} data-state={state}>
      <Icon name={chip.icon} size={16} />
      {t(chip.key)}
    </span>
  );
}

function DateLine({ form, state, language, t }) {
  if (state === 'done' && form.updatedAt) return <p className={styles.date}>{t('form.saved', { date: formatDay(form.updatedAt, language) })}</p>;
  const date = cardDate(form);
  if (date.kind === 'before') return <p className={styles.date}>{t('form.date.before', { date: formatWhen(date.at, language) })}</p>;
  if (date.kind === 'opens') return <p className={styles.date}>{t('form.date.opens', { date: formatWhen(date.at, language) })}</p>;
  return <p className={styles.date}>{t('form.date.none')}</p>;
}

function FormAction({ form, state, title, t }) {
  const textKey = BUTTON[state];
  if (!textKey) {
    return <span className={`${styles.act} ${styles.actOff}`} aria-disabled="true">{t('formButton.closed')}</span>;
  }
  const quiet = state === 'done';
  return (
    <Link href={form.href} prefetch={false} className={`${styles.act} ${quiet ? styles.actQuiet : ''}`} aria-label={t('formButton.aria', { action: t(textKey), form: title })}>
      {t(textKey)}
      {!quiet && <Icon name="arrow" size={18} />}
    </Link>
  );
}

function FormItem({ form, language, t }) {
  const text = FORM_TEXT[form.key];
  const title = text ? t(text.title) : form.label;
  const id = `form-${form.key}`;
  return (
    <li>
      <article className={styles.formItem} data-state={form.card} aria-labelledby={id}>
        <span className={styles.number} aria-hidden="true">{form.number}</span>
        <div className={styles.formBody}>
          <div className={styles.formTop}>
            <h3 id={id}>{title}</h3>
            <Chip state={form.card} t={t} />
          </div>
          {text && <p className={styles.help}>{t(text.help)}</p>}
          <DateLine form={form} state={form.card} language={language} t={t} />
        </div>
        <FormAction form={form} state={form.card} title={title} t={t} />
      </article>
    </li>
  );
}

// Extra open forms (event votes) and result rows (My appointment): same data as before, quieter rows.
function ExtraRow({ form, language, t }) {
  const date = cardDate(form);
  return (
    <li className={styles.row}>
      <div>
        <strong>{form.label}</strong>
        {date.kind === 'before' && <span className={styles.rowSub}>{t('form.date.before', { date: formatWhen(date.at, language) })}</span>}
      </div>
      <Chip state={form.card} t={t} />
      <FormAction form={form} state={form.card} title={form.label} t={t} />
    </li>
  );
}

function ResultRow({ result, t }) {
  return (
    <li className={styles.row}>
      <div>
        <strong>{result.label}</strong>
        <span className={styles.rowSub}>{result.lines?.length ? result.lines.join(' · ') : result.message}</span>
      </div>
      <span className={styles.chip} data-state="result"><Icon name="calendar" size={16} />{t('dash.result.label')}</span>
      <Link href={result.href} prefetch={false} className={`${styles.act} ${result.ready ? '' : styles.actQuiet}`} aria-label={`${t(result.ready ? 'dash.result.see' : 'dash.result.open')}: ${result.label}`}>
        {t(result.ready ? 'dash.result.see' : 'dash.result.open')}
      </Link>
    </li>
  );
}

function Avatar({ profile }) {
  const initial = (profile?.nickname || 'K').trim().charAt(0).toUpperCase();
  return (
    <span className={styles.avatar}>
      {profile?.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={profile.avatarUrl} alt="" />
      ) : (
        <span aria-hidden="true">{initial}</span>
      )}
    </span>
  );
}

function Deadlines({ status, language, t }) {
  const now = status?.now || 0;
  const entries = (status?.entries || []).filter((e) => e.at > now);
  return (
    <section className={styles.moreBlock} aria-labelledby="dash-deadlines">
      <h3 id="dash-deadlines">{t('dash.more.deadlines')}</h3>
      {entries.length === 0 ? <p className={styles.quiet}>{t('dash.more.noDeadlines')}</p> : (
        <ul className={styles.deadlines}>
          {entries.map((entry) => (
            <li key={entry.id}>
              {entry.kind === 'opens' ? <span>{entry.label}</span> : <Link href={entry.href} prefetch={false}>{entry.label}</Link>}
              <span className={styles.rowSub}>
                {isDueSoon(entry.at, now) && <b className={styles.dueSoon}>{t('dash.more.dueSoon')}</b>}
                {formatWhen(entry.at, language)}{entry.estimated ? ` · ${t('dash.more.estimated')}` : ''}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// Signed-in dashboard. Phone: one column (greeting, four numbered form cards, Power Profile row, More).
// Desktop: greeting + More in a calm side column, the form list as the main column.
// The Admin link depends on the live role the session returns, never on client state.
export default function MemberDashboard({ profile, adminAccessRequested, busy, onLogout }) {
  const { t, language } = useLanguage();
  const { status, loaded } = useMemberFormStatus();
  const displayName = (profile.nickname || '').trim() || 'Governor';
  const role = String(profile.role || 'member');
  const links = dashboardLinks(role);
  const linkKey = { events: 'dash.more.events', guides: 'dash.more.guides', tools: 'dash.more.tools', admin: 'dash.more.admin' };
  const failed = loaded && (!status?.signedIn || status?.degraded);
  const home = buildHome(status);
  const empty = loaded && !failed && home.cards.length === 0 && home.extras.length === 0;
  const power = home.power;
  const powerDone = Boolean(power?.submitted);

  return (
    <div className={styles.dash}>
      <header className={styles.top}>
        <Link href="/" className={styles.brand} aria-label={t('dash.wordmarkAria')}>
          <svg viewBox="0 0 40 40" fill="none" aria-hidden="true"><path d="M20 3 L35 8 V19 C35 28 29 34 20 37 C11 34 5 28 5 19 V8 Z" stroke="currentColor" strokeWidth="1.8" /></svg>
          <span>K710</span>
        </Link>
        <div className={styles.topTools}>
          <EasyViewToggle className="easy-view-toggle--header" />
          <LanguageSwitcher className={styles.langBtn} showLabel />
        </div>
      </header>

      <main className={styles.layout} aria-label={t('dash.mainAria')}>
        <section className={styles.greet} aria-labelledby="dash-greeting">
          <h1 id="dash-greeting">{t('dash.greeting', { name: displayName })}</h1>
          {loaded && !failed && (home.left > 0 ? (
            <p className={styles.left} role="status">
              {t.parts('dash.left', { count: home.left }).map((part, i) => (part.variable ? <b key={i}>{part.text}</b> : <span key={i}>{part.text}</span>))}
            </p>
          ) : (
            <div className={styles.caught} role="status">
              <Icon name="check" size={22} />
              <div>
                <p>{empty ? t('dash.nothingOpen') : t('dash.allDone')}</p>
                {!empty && <p className={styles.quiet}>{t('dash.allDoneHint')}</p>}
              </div>
            </div>
          ))}
          {adminAccessRequested && role !== 'admin' && role !== 'superadmin' && (
            <p className={styles.notice} role="status">{t('dash.account.noAdmin')}</p>
          )}
        </section>

        <div className={styles.forms}>
          {!loaded && <p className={styles.quiet} role="status">{t('dash.loading')}</p>}
          {failed && (
            <p className={styles.quiet} role="status">{t('dash.loadError')} <Link href="/forms">{t('dash.loadErrorLink')}</Link></p>
          )}
          {loaded && !failed && home.cards.length > 0 && (
            <section aria-labelledby="dash-forms">
              <h2 id="dash-forms" className={styles.label}>{t('dash.formsHeading')}</h2>
              <ol className={styles.formList}>
                {home.cards.map((form) => <FormItem key={form.key} form={form} language={language} t={t} />)}
              </ol>
            </section>
          )}
          {loaded && !failed && (home.extras.length > 0 || home.results.length > 0) && (
            <section aria-labelledby="dash-also">
              <h2 id="dash-also" className={styles.label}>{t('dash.alsoOpen')}</h2>
              <ul className={styles.rows}>
                {home.extras.map((form) => <ExtraRow key={form.key} form={form} language={language} t={t} />)}
                {home.results.map((result) => <ResultRow key={result.key} result={result} t={t} />)}
              </ul>
            </section>
          )}
          <Link href="/power-profile" prefetch={false} className={styles.power}>
            <Icon name="shield" size={22} />
            <span className={styles.powerText}>
              <strong>{t('dash.power.title')}</strong>
              <span>{t('dash.power.help')}</span>
            </span>
            {powerDone && <Chip state="done" t={t} />}
            <Icon name="arrow" size={18} />
          </Link>
        </div>

        <details className={styles.more}>
          <summary>
            <span className={styles.moreTitle}>{t('dash.more.title')}</span>
            <span className={styles.moreHint}>{t('dash.more.hint')}</span>
            <Icon name="arrow" size={18} />
          </summary>
          <div className={styles.moreBody}>
            <nav aria-label={t('dash.moreNavAria')}>
              <ul className={styles.moreLinks}>
                <li><Link href="/forms">{t('dash.more.allForms')}<Icon name="arrow" size={18} /></Link></li>
                {links.map((link) => (
                  <li key={link.key}><Link href={link.href}>{t(linkKey[link.key])}<Icon name="arrow" size={18} /></Link></li>
                ))}
              </ul>
            </nav>

            <Deadlines status={status} language={language} t={t} />

            <section className={styles.moreBlock} aria-labelledby="dash-gifts">
              <h3 id="dash-gifts">{t('dash.more.giftCodes')}</h3>
              <GiftCodeRewards />
            </section>

            <section className={styles.moreBlock} aria-labelledby="dash-account">
              <h3 id="dash-account">{t('dash.account.title')}</h3>
              <div className={styles.who}>
                <Avatar profile={profile} />
                <div>
                  <strong>{profile.nickname}</strong>
                  <span>#{profile.playerId} · {t('dash.account.kingdom', { id: profile.kingdomId })}</span>
                  <span>{profile.allianceAbbr ? `[${profile.allianceAbbr}] ${profile.allianceName}` : t('dash.account.noAlliance')}</span>
                </div>
                <span className={styles.role} data-role={role}>{role}</span>
              </div>
              <dl className={styles.stats}>
                <div><dt>{t('dash.account.power')}</dt><dd>{formatNumber(profile.power)}</dd></div>
                <div><dt><Term term="Mystic Trial">{t('dash.account.mysticTrial')}</Term></dt><dd>{formatNumber(profile.mysticTrial)}</dd></div>
              </dl>
              <p className={styles.quiet}>{t('dash.account.session')}</p>
            </section>

            <button className={`${styles.act} ${styles.actQuiet} ${styles.logout}`} type="button" onClick={onLogout} disabled={busy}>
              {busy ? t('shared.loggingOut') : t('shared.logout')}
            </button>
          </div>
        </details>
        <p className={styles.foot}>{t('dash.footer')}</p>
      </main>
    </div>
  );
}
