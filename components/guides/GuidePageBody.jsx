import GuideFrame from './GuideFrame';
import { AreaBlocks } from './GuideBlocks';
import GuideReaderTabs from './GuideReaderTabs';
import { countWords, guideMeta, guideSubtitle, shouldShowToc, TOC_MIN_HEADINGS, TOC_MIN_WORDS } from '../../lib/guideContent.mjs';
import { layoutHeadings } from '../../lib/guideLayout.mjs';
import styles from './guideLayout.module.css';

// Header, contents list, template areas and reader tabs for a block guide.
// Used verbatim by the public page and by the builder's Preview toggle.
export default function GuidePageBody({ guide, renderArea, editing = false }) {
  const layout = guide.layout;
  const headings = layoutHeadings(layout);
  const anchors = Object.fromEntries(headings.map(h => [h.blockId, h.id]));
  const subtitle = guideSubtitle(guide.title, guide.description);
  const showToc = !editing && headings.length >= TOC_MIN_HEADINGS && countWords(guide.body) >= TOC_MIN_WORDS;
  return (
    <>
      <header className={`guide-header ${styles.header}`}>
        <span className="k-mark">{guide.category}</span>
        <h1 className={`k-display ${styles.title}`}>{guide.title}</h1>
        {subtitle ? <p className={`k-narrative ${styles.subtitle}`}>{subtitle}</p> : null}
        <div className={`guide-rule ${styles.rule}`} aria-hidden="true" />
      </header>
      <article className={`guide-volume ${styles.volume}`}>
        <div className={`guide-volume-spine ${styles.spine}`} aria-hidden="true" />
        <div className={`guide-body k-narrative ${styles.body}`}>
          {showToc ? (
            <nav className={styles.toc} aria-label="On this page">
              <strong>On this page</strong>
              <ol>{headings.map(h => <li key={h.id} data-level={h.level}><a href={`#${h.id}`}>{h.text}</a></li>)}</ol>
            </nav>
          ) : null}
          <GuideFrame
            templateId={layout.template}
            editing={editing}
            renderArea={renderArea || (area => <AreaBlocks blocks={layout.areas[area.id] || []} anchors={anchors} />)}
          />
          {editing ? null : <GuideReaderTabs f2p={guide.f2p_content} spender={guide.spender_content} />}
        </div>
      </article>
    </>
  );
}

export function GuideMetaFooter({ guide, extra = null }) {
  const meta = guideMeta(guide);
  return (
    <footer className={`guide-footer ${styles.footer}`}>
      <span>
        {meta.minutes} min read
        {meta.updatedLabel ? <> · Updated <time dateTime={meta.updatedIso}>{meta.updatedLabel}</time></> : null}
        {meta.reviewedBy ? <> · Last reviewed by {meta.reviewedBy}</> : null}
      </span>
      {extra}
    </footer>
  );
}

export { TOC_MIN_HEADINGS, TOC_MIN_WORDS };
