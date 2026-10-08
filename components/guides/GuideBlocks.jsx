import GuideMarkdown from './GuideMarkdown';
import { videoEmbedSrc, videoLinkUrl } from '../../lib/guideLayout.mjs';
import VideoFacade from './VideoFacade';
import styles from './guideLayout.module.css';

// Presentational block renderers shared by the public guide page, the preview
// and the builder canvas. No hooks and no editor code in here.

export function GuideImage({ item, caption, width = 'full', align = 'center', priority = false }) {
  if (!item?.src) return null;
  const alt = item.decorative ? '' : item.alt || '';
  const img = (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={item.src} alt={alt} loading={priority ? 'eager' : 'lazy'} decoding="async" />
  );
  return (
    <figure className={styles.image} data-width={width} data-align={align}>
      {img}
      {caption ? <figcaption>{caption}</figcaption> : null}
    </figure>
  );
}

function Heading({ block, anchor }) {
  const Tag = block.level === 3 ? 'h3' : 'h2';
  if (!block.text.trim()) return null;
  return <Tag id={anchor || undefined} className={styles.heading} data-level={block.level}>{block.text}</Tag>;
}

function Callout({ block }) {
  const label = { info: 'Note', warn: 'Warning', tip: 'Tip' }[block.tone];
  return (
    <aside className={styles.callout} data-tone={block.tone} aria-label={block.title || label}>
      <p className={styles.calloutTitle}><span aria-hidden="true" className={styles.calloutMark} />{block.title || label}</p>
      {block.md.trim() ? <div className={styles.prose}><GuideMarkdown>{block.md}</GuideMarkdown></div> : null}
    </aside>
  );
}

function Button({ block }) {
  if (!block.href || !block.label) return null;
  const external = /^https?:\/\//i.test(block.href);
  return (
    <div className={styles.buttonRow} data-align={block.align}>
      <a className={styles.button} data-variant={block.variant} href={block.href} {...(external ? { rel: 'noopener noreferrer', target: '_blank' } : {})}>
        {block.label}{external ? <span className={styles.srOnly}> (opens in a new tab)</span> : null}
      </a>
    </div>
  );
}

// Videos: YouTube (privacy-enhanced domain) or a Google Drive preview, both
// loaded only when the reader clicks. Server component; the facade is the only
// client code and degrades to a normal link without JavaScript.
function Video({ block }) {
  const href = videoLinkUrl(block);
  if (!href) return null;
  return (
    <VideoFacade
      provider={block.provider}
      embedSrc={videoEmbedSrc(block)}
      href={href}
      title={block.title}
      label={block.provider === 'drive' ? 'Google Drive video' : 'YouTube video'}
    />
  );
}

function Table({ block }) {
  const rows = block.rows.filter(r => r.length);
  if (!rows.length) return null;
  const head = block.header ? rows[0] : null;
  const body = block.header ? rows.slice(1) : rows;
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        {head ? <thead><tr>{head.map((c, i) => <th key={i} scope="col">{c}</th>)}</tr></thead> : null}
        <tbody>{body.map((r, ri) => <tr key={ri}>{r.map((c, ci) => <td key={ci}>{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

export function BlockView({ block, anchor }) {
  switch (block.type) {
    case 'heading': return <Heading block={block} anchor={anchor} />;
    case 'text': return block.md.trim() ? <div className={styles.prose}><GuideMarkdown>{block.md}</GuideMarkdown></div> : null;
    case 'image': return <GuideImage item={block} caption={block.caption} width={block.width} align={block.align} />;
    case 'imagegrid': {
      const images = block.images.filter(i => i.src);
      if (!images.length) return null;
      return <div className={styles.imageGrid} data-count={images.length}>{images.map((item, i) => <GuideImage key={i} item={item} />)}</div>;
    }
    case 'callout': return <Callout block={block} />;
    case 'divider': return <hr className={styles.divider} />;
    case 'button': return <Button block={block} />;
    case 'video': return <Video block={block} />;
    case 'table': return <Table block={block} />;
    default: return null;
  }
}

export function AreaBlocks({ blocks, anchors = {} }) {
  return blocks.map(block => <div key={block.id} className={styles.block} data-type={block.type}><BlockView block={block} anchor={anchors[block.id]} /></div>);
}
