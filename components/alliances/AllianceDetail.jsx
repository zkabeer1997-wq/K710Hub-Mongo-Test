'use client';

// Individual alliance page: banner in the alliance's own colour, a status
// strip of equal cells, then three equal panels (Leadership, Bear Hunts, Join).
import Link from 'next/link';
import { Button, PageHero, Tag } from '../ui';
import { AllianceBearTimes } from '../BearScheduleProvider';
import { useT } from '../i18n/LanguageProvider';
import AllianceLeaders from './AllianceLeaders';
import { STATUS_TONE, bandProps } from '../../lib/alliances.mjs';
import './alliances.css';

export default function AllianceDetail({ alliance, blurb }) {
  const t = useT();
  const roster = Number(alliance.roster_size);
  const text = (v) => (typeof v === 'string' ? v.trim() : '');
  const known = ['open', 'selective', 'closed'].includes(alliance.recruiting_status);
  const status = known ? t(`alliances.status.${alliance.recruiting_status}`) : text(alliance.recruiting_status);
  const cells = [
    status && { key: 'status', label: t('alliances.strip.status'), value: <Tag tone={STATUS_TONE[alliance.recruiting_status] || 'neutral'}>{status}</Tag> },
    Number.isFinite(roster) && roster > 0 && { key: 'members', label: t('alliances.strip.members'), value: roster },
    text(alliance.language) && { key: 'language', label: t('alliances.strip.language'), value: text(alliance.language) },
    text(alliance.timezone_focus) && { key: 'timezone', label: t('alliances.strip.timezone'), value: text(alliance.timezone_focus) },
  ].filter(Boolean);
  const legacyContact = alliance.legacy_leaders ? text(alliance.leader_player_id) : '';
  const tag = String(alliance.tag);

  return (
    <div className="al-detail k-wb" {...bandProps(tag)}>
      <div className="al-banner">
        <PageHero
          eyebrow={t('alliances.eyebrow', { tag })}
          title={alliance.name}
          lede={blurb || undefined}
          actions={<Link href="/alliances">{t('alliances.back')}</Link>}
        />
      </div>
      <div className="al-detail-inner">
        {cells.length > 0 && (
          <dl className="al-strip" style={{ '--cells': cells.length }}>
            {cells.map((c) => (
              <div key={c.key} className="al-strip-cell"><dt>{c.label}</dt><dd>{c.value}</dd></div>
            ))}
          </dl>
        )}
        <div className="al-panels">
          <section className="al-panel" aria-labelledby="al-leadership-h">
            <h2 id="al-leadership-h" className="al-panel-h">{t('alliances.panel.leadership')}</h2>
            <AllianceLeaders leaders={alliance.leaders} legacyContact={legacyContact} />
          </section>
          <section className="al-panel" aria-labelledby="al-bear-h">
            <h2 id="al-bear-h" className="al-panel-h">{t('alliances.panel.bear')}</h2>
            <div className="al-bear-list"><AllianceBearTimes tag={tag} initialTimes={alliance.bear_times_utc} /></div>
            <a className="al-link" href={`/api/events/bear-hunt.ics?alliance=${tag}`} download>{t('alliances.bear.calendar', { tag })}</a>
            <Link className="al-link" href="/alliances">{t('alliances.bear.all')}</Link>
          </section>
          <section className="al-panel" aria-labelledby="al-join-h">
            <h2 id="al-join-h" className="al-panel-h">{t('alliances.panel.join')}</h2>
            <p className="al-muted">{t('alliances.join.line', { name: alliance.name })}</p>
            <Button href="/interest" variant="struck" className="al-join-cta">{t('alliances.join.cta', { name: alliance.name })}</Button>
          </section>
        </div>
      </div>
    </div>
  );
}
