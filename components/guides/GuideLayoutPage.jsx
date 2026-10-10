import Link from 'next/link';
import Breadcrumbs from '../Breadcrumbs';
import GuidePageBody, { GuideMetaFooter } from './GuidePageBody';
import styles from './guideLayout.module.css';

// Public, server-rendered page for guides that use a block layout. No editor
// code is imported here - readers only receive the block renderers.
export default function GuideLayoutPage({ guide, prev, next, isAdmin = false, memberId = '' }) {
  const query = memberId ? `?member_id=${encodeURIComponent(memberId)}` : '';
  return (
    <main className={`armory guide-page ${styles.page}`}>
      <div className={`guide-inner ${styles.inner}`}>
        <div className={styles.noPrint}>
          <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: 'Guides', href: `/guides${query}` }]} current={guide.title} />
        </div>
        {isAdmin ? (
          <div className={styles.adminBar}>
            <span className={styles.adminBadge}>Admin</span>
            {!guide.is_published ? <span className={styles.adminBadge}>Draft - not public</span> : null}
            <Link className={styles.adminLink} href={`/admin/dashboard/guides/${guide.slug}`}>Edit in page builder</Link>
          </div>
        ) : null}
        <GuidePageBody guide={guide} />
        <GuideMetaFooter guide={guide} extra={memberId ? <span>Member {memberId}</span> : null} />
        {(prev || next) ? (
          <nav className={`guide-pager ${styles.pager}`} aria-label="More guides">
            {prev ? (
              <Link href={`/guides/${prev.slug}${query}`} className={`guide-pager-link ${styles.pagerLink}`}>
                <span className="k-mark">← Previous</span>
                <strong>{prev.title}</strong>
              </Link>
            ) : <span />}
            {next ? (
              <Link href={`/guides/${next.slug}${query}`} className={`guide-pager-link ${styles.pagerLink} ${styles.pagerNext}`}>
                <span className="k-mark">Next →</span>
                <strong>{next.title}</strong>
              </Link>
            ) : <span />}
          </nav>
        ) : null}
      </div>
    </main>
  );
}
