import Link from 'next/link';
import { notFound } from 'next/navigation';
import LoreStory from '../../../components/lore/LoreStory';
import { loreFirstSentence, loreNeighbours, parseLoreSlug } from '../../../lib/lore.mjs';
import { loadPublishedStories } from '../../../lib/lore.server';
import '../lore.css';

// The root layout reads headers() (per-request CSP nonce), so every route is dynamic; say so explicitly.
export const dynamic = 'force-dynamic';

async function findStory(slug) {
  const number = parseLoreSlug(slug);
  if (!number) return { stories: [], story: null };
  const stories = await loadPublishedStories();
  return { stories, story: stories.find((s) => s.number === number) || null };
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const canonical = `/lore/${slug}`;
  const { story } = await findStory(slug);
  if (!story) return { title: '710 Lore', alternates: { canonical } };
  const title = `${story.title} (Story ${story.number})`;
  const description = loreFirstSentence(story.body) || undefined;
  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title, description, type: 'article', url: canonical,
      ...(story.image ? { images: [{ url: story.image.url, alt: story.image.alt, ...(story.image.width ? { width: story.image.width, height: story.image.height } : {}) }] } : {}),
    },
    ...(story.image ? { twitter: { card: 'summary_large_image', title, description, images: [story.image.url] } } : {}),
  };
}

export default async function LoreStoryPage({ params }) {
  const { slug } = await params;
  const { stories, story } = await findStory(slug);
  if (!story) notFound();
  const { prev, next } = loreNeighbours(stories, story.number);
  return (
    <main className="theme-realm lore-page" lang="en" translate="no" data-no-translate="">
      <div className="lore-wrap lore-single">
        <Link href="/lore" className="lore-back">← All 710 Lore</Link>
        <LoreStory story={story} heading="h1" linked={false} priority />
        <nav className="lore-pager" aria-label="More stories">
          {prev ? <Link href={`/lore/${prev.slug}`} className="lore-pager-prev" rel="prev"><small>← Previous</small><span>{prev.title}</span></Link> : null}
          {next ? <Link href={`/lore/${next.slug}`} className="lore-pager-next" rel="next"><small>Next →</small><span>{next.title}</span></Link> : null}
        </nav>
      </div>
    </main>
  );
}
