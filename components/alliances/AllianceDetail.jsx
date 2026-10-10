'use client';

// Individual alliance page ("Option B: banner and three panels"): a banner card in the alliance's own
// colour (or the admin's photo under a colour scrim), a status strip of four equal cells, then three
// equal panels (Leadership, Bear Hunt, Join). Dark brass surface, self-contained (.al-scope), on a band-colour
// backdrop. From 1280px wide two rails sit in the margins (after the main content in the DOM).
import Link from 'next/link';
import { AllianceBearTimes } from '../BearScheduleProvider';
import { useT } from '../i18n/LanguageProvider';
import AllianceLeaders from './AllianceLeaders';
import AllianceBackdrop from './AllianceBackdrop';
import { LeftRail, RightRail } from './AllianceRails';
import useAlliancePhoto, { AlliancePhotoImg } from './useAlliancePhoto';
import { STATUS_TONE, bandProps } from '../../lib/alliances.mjs';
import './alliances.css';

export default function AllianceDetail({ alliance, blurb, others = [], kvk = null }) {
  const t = useT();
  const photo = useAlliancePhoto(alliance.image_url || '');
  const roster = Number(alliance.roster_size);
  const text = (v) => (typeof v === 'string' ? v.trim() : '');
  const known = ['open', 'selective', 'closed'].includes(alliance.recruiting_status);
  const status = known ? t(`alliances.status.${alliance.recruiting_status}`) : text(alliance.recruiting_status);
  const cells = [
    status && { key: 'status', label: t('alliances.strip.status'), value: <span className="al-status" data-tone={STATUS_TONE[alliance.recruiting_status] || 'neutral'}><span className="al-dot" aria-hidden="true" />{status}</span> },
    Number.isFinite(roster) && roster > 0 && { key: 'members', label: t('alliances.strip.members'), value: roster },
    text(alliance.language) && { key: 'language', label: t('alliances.strip.language'), value: text(alliance.language) },
    text(alliance.timezone_focus) && { key: 'timezone', label: t('alliances.strip.timezone'), value: text(alliance.timezone_focus) },
  ].filter(Boolean);
  const legacyContact = alliance.legacy_leaders ? text(alliance.leader_player_id) : '';
  const tag = String(alliance.tag);
  const hasBearTimes = Array.isArray(alliance.bear_times_utc) && alliance.bear_times_utc.length > 0;

  return (
    <div className="al-detail al-scope k-wb" {...bandProps(tag)}>
      <AllianceBackdrop tag={tag} />
      <div className="al-layout">
        <div className="al-main">
        <Link className="al-back" href="/alliances">{t('alliances.back')}</Link>
        <div id="al-overview" className="al-overview">
        <header className="al-banner" data-photo={photo.show ? 'true' : undefined}>
          {photo.show && <AlliancePhotoImg className="al-banner-photo" src={alliance.image_url} alt={alliance.image_alt} eager onFail={photo.fail} />}
          <div className="al-banner-copy">
            <p className="al-eyebrow">{t('alliances.eyebrow', { tag })}</p>
            <h1 className="al-title">{alliance.name}</h1>
            {blurb && <p className="al-lede">{blurb}</p>}
          </div>
        </header>
        {cells.length > 0 && (
          <dl className="al-strip" style={{ '--cells': cells.length }}>
            {cells.map((c) => (
              <div key={c.key} className="al-strip-cell"><dt>{c.label}</dt><dd>{c.value}</dd></div>
            ))}
          </dl>
        )}
        </div>
        <div className="al-panels">
          <section id="al-leadership" className="al-panel" aria-labelledby="al-leadership-h">
            <h2 id="al-leadership-h" className="al-panel-h">{t('alliances.panel.leadership')}</h2>
            <AllianceLeaders leaders={alliance.leaders} legacyContact={legacyContact} />
          </section>
          <section id="al-bear" className="al-panel" aria-labelledby="al-bear-h">
            <h2 id="al-bear-h" className="al-panel-h">{t('alliances.panel.bearHunt')}</h2>
            <AllianceBearTimes tag={tag} initialTimes={alliance.bear_times_utc} variant="rows" rowLabel={(i) => t('alliances.bear.hunt', { n: i + 1 })} />
            <div className="al-panel-links">
              {hasBearTimes && <a className="al-link" href={`/api/events/bear-hunt.ics?alliance=${tag}`} download>{t('alliances.bear.calendar', { tag })}</a>}
              <Link className="al-link" href="/alliances">{t('alliances.bear.all')}</Link>
            </div>
          </section>
          <section id="al-join" className="al-panel" aria-labelledby="al-join-h">
            <h2 id="al-join-h" className="al-panel-h">{t('alliances.panel.join')}</h2>
            <p className="al-muted">{t('alliances.join.line', { name: alliance.name })}</p>
            <Link href="/interest" className="al-cta">{t('alliances.join.cta', { name: alliance.name })}</Link>
          </section>
        </div>
        </div>
        <LeftRail alliances={others} currentTag={tag} />
        <RightRail tag={tag} bearTimes={alliance.bear_times_utc} kvk={kvk} />
      </div>
    </div>
  );
}
