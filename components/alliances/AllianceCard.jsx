'use client';

// One equal box of the alliances landing grid (Realm). Works for any tag: the
// colour comes from lib/alliances.mjs bandProps() and the --wb-* tokens.
import Link from 'next/link';
import { Tag } from '../ui';
import { AllianceBearTimes } from '../BearScheduleProvider';
import { useT } from '../i18n/LanguageProvider';
import AllianceLeaders from './AllianceLeaders';
import { STATUS_TONE, allianceMetaParts, bandProps } from '../../lib/alliances.mjs';
import './alliances.css';

export default function AllianceCard({ alliance, compact = false }) {
  const t = useT();
  const href = `/alliances/${String(alliance.tag).toLowerCase()}`;
  const meta = allianceMetaParts(alliance);
  const headingId = `al-${String(alliance.tag).toLowerCase()}-h`;
  const status = ['open', 'selective', 'closed'].includes(alliance.recruiting_status)
    ? t(`alliances.status.${alliance.recruiting_status}`)
    : alliance.recruiting_status;
  return (
    <article className="al-box k-wb" {...bandProps(alliance.tag)} aria-labelledby={headingId}>
      <span className="al-mark" aria-hidden="true">{alliance.tag}</span>
      <div className="al-box-top">
        <Tag band={alliance.tag}>{alliance.tag}</Tag>
        {status && <Tag tone={STATUS_TONE[alliance.recruiting_status] || 'neutral'}>{status}</Tag>}
      </div>
      <h3 id={headingId} className="al-box-name"><Link href={href}>{alliance.name}</Link></h3>
      {!compact && alliance.blurb && <p className="al-box-blurb">{alliance.blurb}</p>}
      {meta.length > 0 && <p className="al-box-meta">{meta.join(' · ')}</p>}
      {!compact && <AllianceLeaders leaders={alliance.leaders} variant="r5" />}
      {!compact && (
        <div className="al-box-times">
          <p className="al-label">{t('alliances.bearHunts')}</p>
          <AllianceBearTimes tag={alliance.tag} initialTimes={alliance.bear_times_utc} />
        </div>
      )}
      <Link className="al-box-more" href={href}>{t('alliances.view', { tag: alliance.tag })}<span aria-hidden="true"> →</span></Link>
    </article>
  );
}
