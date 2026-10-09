'use client';

// One equal box of the alliances landing grid (dark brass, same family as the alliance page).
// Works for any tag: the colour comes from lib/alliances.mjs bandProps() and the --wb-* tokens.
// Top of the box is a fixed 16:9 frame: the admin's photo, or (no photo / photo failed) a band-colour
// panel with the tag as a large monogram, so all boxes stay the same height.
import Link from 'next/link';
import { AllianceBearTimes } from '../BearScheduleProvider';
import { useT } from '../i18n/LanguageProvider';
import AllianceLeaders from './AllianceLeaders';
import useAlliancePhoto, { AlliancePhotoImg } from './useAlliancePhoto';
import { STATUS_TONE, allianceMetaParts, bandProps } from '../../lib/alliances.mjs';
import './alliances.css';

export default function AllianceCard({ alliance, compact = false }) {
  const t = useT();
  const photo = useAlliancePhoto(alliance.image_url || '');
  const tag = String(alliance.tag);
  const href = `/alliances/${tag.toLowerCase()}`;
  const meta = allianceMetaParts(alliance);
  const headingId = `al-${tag.toLowerCase()}-h`;
  const known = ['open', 'selective', 'closed'].includes(alliance.recruiting_status);
  const status = known ? t(`alliances.status.${alliance.recruiting_status}`) : alliance.recruiting_status;
  return (
    <article className="al-box al-scope k-wb" data-compact={compact ? 'true' : undefined} {...bandProps(tag)} aria-labelledby={headingId}>
      <div className="al-media" style={{ '--len': Math.max(tag.length, 2) }}>
        <span className="al-monogram" aria-hidden="true">{tag}</span>
        {photo.show && <AlliancePhotoImg className="al-photo" src={alliance.image_url} alt={alliance.image_alt} onFail={photo.fail} />}
      </div>
      <div className="al-box-body">
        <div className="al-box-top">
          <span className="al-chip" data-kind="band"><span className="al-gem" aria-hidden="true" />{tag}</span>
          {status && <span className="al-chip" data-tone={STATUS_TONE[alliance.recruiting_status] || 'neutral'}><span className="al-dot" aria-hidden="true" />{status}</span>}
        </div>
        <h3 id={headingId} className="al-box-name"><Link href={href}>{alliance.name}</Link></h3>
        {!compact && alliance.blurb && <p className="al-box-blurb">{alliance.blurb}</p>}
        {meta.length > 0 && <p className="al-box-meta">{meta.join(' · ')}</p>}
        {!compact && <AllianceLeaders leaders={alliance.leaders} variant="r5" />}
        {!compact && (
          <div className="al-box-times">
            <p className="al-label">{t('alliances.bearHunts')}</p>
            <AllianceBearTimes tag={tag} initialTimes={alliance.bear_times_utc} variant="rows" rowLabel={(i) => t('alliances.bear.hunt', { n: i + 1 })} />
          </div>
        )}
        <Link className="al-box-more" href={href}>{t('alliances.view', { tag })}<span aria-hidden="true"> →</span></Link>
      </div>
    </article>
  );
}
