import { Suspense } from 'react';
import { cookies } from 'next/headers';
import Link from 'next/link';
import GuideArticle from './GuideArticle';
import { getCollection } from '../../../lib/mongo';
import { COLLECTIONS } from '../../../lib/mongoCollections';
import { readMemberSession } from '../../../lib/memberAuth';
import { isAdminRequest } from '../../../lib/adminAuth';
import { guidesTable, canReadGuide } from '../../../lib/guideAccess.mjs';

export const dynamic = 'force-dynamic';

function guidesCollectionName() {
  const table = typeof guidesTable === 'function' ? guidesTable() : 'kingdom_guides';
  return table === 'guide_content' ? COLLECTIONS.GUIDE_CONTENT : COLLECTIONS.KINGDOM_GUIDES;
}

async function loadGuideBySlug(slug) {
  const coll = await getCollection(guidesCollectionName());
  return coll.findOne(
    { slug },
    {
      projection: {
        slug: 1,
        title: 1,
        category: 1,
        description: 1,
        body: 1,
        position: 1,
        is_published: 1,
        access_level: 1,
        created_at: 1,
        updated_at: 1,
        _id: 0,
      },
    }
  );
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  try {
    const data = await loadGuideBySlug(slug);
    if (!data?.is_published || data.access_level === 'members') {
      return { title: 'Member guide | K710', robots: { index: false, follow: false } };
    }
    return {
      title: data.title,
      description: data.description,
      openGraph: { title: data.title, description: data.description },
      alternates: { canonical: `/guides/${slug}` },
    };
  } catch {
    return { title: 'Kingdom Guide | K710' };
  }
}

export default async function GuidePage({ params }) {
  const { slug } = await params;
  const request = { cookies: await cookies() };
  const [admin, session] = await Promise.all([isAdminRequest(request), readMemberSession(request)]);
  let guide = null;
  let loadError = '';
  let prev = null;
  let next = null;

  try {
    guide = await loadGuideBySlug(slug);
    if (canReadGuide(guide, { admin, member: Boolean(session) })) {
      const coll = await getCollection(guidesCollectionName());
      const filter = { is_published: true };
      if (!admin && !session) filter.access_level = 'public';
      const neighbors = await coll
        .find(filter)
        .project({ slug: 1, title: 1, category: 1, position: 1, _id: 0 })
        .sort({ position: 1, title: 1 })
        .toArray();
      const index = neighbors?.findIndex((g) => g.slug === slug) ?? -1;
      if (index >= 0) {
        prev = neighbors[index - 1] || null;
        next = neighbors[index + 1] || null;
      }
    }
  } catch {
    loadError = 'This guide could not be loaded. Please try again.';
  }

  if (!canReadGuide(guide, { admin, member: Boolean(session) })) {
    const membersOnly = guide?.is_published && guide.access_level === 'members';
    return (
      <main className="theme-realm" style={{ padding: '100px 24px', minHeight: '65vh' }}>
        <h1>{membersOnly ? 'Member guide' : 'Guide unavailable'}</h1>
        <p>
          {loadError ||
            (membersOnly
              ? 'Sign in to read this member guide.'
              : 'This guide is unavailable or has not been published.')}
        </p>
        {membersOnly ? (
          <Link href={`/player-record?next=${encodeURIComponent(`/guides/${slug}`)}`}>Member login</Link>
        ) : (
          <Link href="/guides">Browse guides</Link>
        )}
      </main>
    );
  }

  const jsonLd =
    guide.access_level === 'public' && guide.is_published
      ? {
          '@context': 'https://schema.org',
          '@type': 'Article',
          headline: guide.title,
          description: guide.description,
          articleSection: guide.category,
          datePublished: guide.created_at,
          dateModified: guide.updated_at,
          author: { '@type': 'Organization', name: 'Kingdom 710' },
        }
      : null;

  return (
    <>
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
        />
      )}
      <Suspense fallback={null}>
        <GuideArticle
          slug={slug}
          initialGuide={guide}
          initialIsAdmin={admin}
          initialError=""
          prev={prev}
          next={next}
        />
      </Suspense>
    </>
  );
}
