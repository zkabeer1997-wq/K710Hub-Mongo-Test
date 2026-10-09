import { stripLegacyBearCopy } from '../../../lib/publicBearSchedule';
import Link from 'next/link';
import { notFound, unstable_rethrow } from 'next/navigation';
import { PageHero } from '../../../components/ui';
import AllianceDetail from '../../../components/alliances/AllianceDetail';
import { loadAllianceByTag } from '../../../lib/alliancesPublic.server';

// The root layout reads headers() (per-request CSP nonce), so every route is
// dynamic. Declare that explicitly: a page with generateStaticParams would be
// treated as ISR and its runtime render would throw DYNAMIC_SERVER_USAGE.
export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }) {
  const { tag } = await params;
  const canonical = `/alliances/${String(tag || '').toLowerCase()}`;
  try {
    const alliance = await loadAllianceByTag(tag);
    if (!alliance) return { title: 'Alliance', alternates: { canonical } };
    return { title: alliance.name, description: alliance.blurb || undefined, alternates: { canonical } };
  } catch (error) {
    unstable_rethrow(error);
    return { title: 'Alliance', alternates: { canonical } };
  }
}

export default async function AlliancePage({ params }) {
  const { tag } = await params;
  let alliance = null;
  try {
    alliance = await loadAllianceByTag(tag);
  } catch (error) {
    unstable_rethrow(error);
    console.error('alliance page load failed', error);
    return (
      <main className="theme-realm alliance-page" style={{ minHeight: '100vh', background: 'var(--color-bg)', color: 'var(--color-ink)' }}>
        <PageHero eyebrow="Kingdom 710 alliance" title="Alliance" lede="This alliance could not be loaded right now." actions={<Link href="/alliances">← All alliances</Link>} />
      </main>
    );
  }
  if (!alliance) notFound();

  return (
    <main className="theme-realm alliance-detail-page" style={{ padding: 0, background: 'var(--color-bg)' }}>
      <AllianceDetail alliance={alliance} blurb={stripLegacyBearCopy(alliance.blurb)} />
    </main>
  );
}
