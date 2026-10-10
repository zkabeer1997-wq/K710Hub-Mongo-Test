import Link from 'next/link';
import { splitLoreParagraphs } from '../../lib/lore.mjs';

// One lore story: a chapter marker in the margin, then title, photo and text in a reading column.
// The text is plain text rendered as React text (escaped), never HTML; `white-space: pre-line` keeps
// the owner's line breaks (dialogue lines) inside a paragraph.
// `heading` is 'h2' on the list page and 'h1' on a story's own page.
export default function LoreStory({ story, heading = 'h2', linked = true, priority = false }) {
  const Heading = heading;
  const { image } = story;
  const ratio = image && image.width && image.height ? image.width / image.height : 0;
  const shape = !image ? '' : ratio && ratio < 0.85 ? 'portrait' : ratio && ratio < 1.2 ? 'square' : 'wide';
  return (
    <article className="lore-story" id={story.slug} aria-labelledby={`${story.slug}-title`}>
      <div className="lore-marker" aria-hidden="true">
        <span className="lore-marker-word">Story</span>
        <span className="lore-marker-num">{story.number}</span>
      </div>
      <div className="lore-column">
        <Heading className="lore-title" id={`${story.slug}-title`}>
          <span className="lore-title-label">Story {story.number}</span>
          {linked ? <Link href={`/lore/${story.slug}`}>{story.title}</Link> : story.title}
        </Heading>
        {image && (
          <figure className={`lore-photo lore-photo--${shape}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={image.url}
              alt={image.alt}
              {...(image.width && image.height ? { width: image.width, height: image.height } : {})}
              loading={priority ? 'eager' : 'lazy'}
              decoding="async"
            />
          </figure>
        )}
        <div className="lore-text">
          {splitLoreParagraphs(story.body).map((paragraph, i) => <p key={i}>{paragraph}</p>)}
        </div>
      </div>
    </article>
  );
}
