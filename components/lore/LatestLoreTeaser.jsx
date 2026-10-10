import Link from 'next/link';
import { loreExcerpt } from '../../lib/lore.mjs';
import '../../app/lore/lore.css';

// Small "latest story" band for the Home page. Renders nothing without a published story.
// The story's title and excerpt are English only (data-no-translate); the label and link translate as usual.
export default function LatestLoreTeaser({ story }) {
  if (!story) return null;
  return (
    <section className="home-lore theme-realm" aria-labelledby="home-lore-h">
      <div className="home-lore-inner">
        <div className="lore-marker" aria-hidden="true">
          <span className="lore-marker-word">Story</span>
          <span className="lore-marker-num" data-no-translate="">{story.number}</span>
        </div>
        <div>
          <p className="lore-title-label" style={{ position: 'static', width: 'auto', height: 'auto', clipPath: 'none', marginBottom: 6 }}>Latest 710 Lore</p>
          <h2 id="home-lore-h" data-no-translate="" translate="no" lang="en">{story.title}</h2>
          <p data-no-translate="" translate="no" lang="en">{loreExcerpt(story.body, 150)}</p>
        </div>
        <Link href={`/lore/${story.slug}`} className="home-lore-link">Read the story →</Link>
      </div>
    </section>
  );
}
