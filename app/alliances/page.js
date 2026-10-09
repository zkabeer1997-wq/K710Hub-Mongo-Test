import { unstable_rethrow } from 'next/navigation';
import { PageHero } from '../../components/ui';
import AllianceGrid from '../../components/alliances/AllianceGrid';
import { getPageText } from '../../lib/pageText.server';
import { splitParagraphs } from '../../lib/pageText.mjs';
import { loadLandingAlliances } from '../../lib/alliancesPublic.server';
import { stripLegacyBearCopy } from '../../lib/publicBearSchedule';
import '../../components/alliances/alliances.css';

export const metadata = {
  title: 'Alliances',
  description: 'The alliances of Kingdom 710: Bear Hunt times, languages, recruiting status and leadership for each one.',
  alternates: { canonical: '/alliances' },
};

// The root layout reads headers() (CSP nonce), so this is dynamic; say so explicitly.
export const dynamic = 'force-dynamic';

async function load() {
  try {
    return { alliances: await loadLandingAlliances(), failed: false };
  } catch (error) {
    unstable_rethrow(error);
    console.error('alliances landing load failed', error);
    return { alliances: [], failed: true };
  }
}

export default async function AlliancesPage() {
  const [{ alliances, failed }, t] = await Promise.all([load(), getPageText('about')]);
  const list = alliances.map((a) => ({ ...a, blurb: stripLegacyBearCopy(a.blurb) }));
  const intro = splitParagraphs(t.alliances_intro);
  return (
    <main className="theme-realm alliances-landing" style={{ padding: 0, background: 'var(--color-bg)', color: 'var(--color-ink)' }}>
      <PageHero eyebrow={t.alliances_kicker} title={t.alliances_heading} lede={intro.join(' ')} />
      <section className="al-landing-inner" aria-label={t.alliances_heading} style={{ maxWidth: 'var(--page-max)', margin: '0 auto', padding: 'clamp(32px,5vw,56px) var(--page-gutter) 96px' }}>
        {list.length === 0 ? (
          <p className="al-muted">{failed ? 'The alliance directory is unavailable right now. Please try again shortly.' : 'No alliances are listed yet.'}</p>
        ) : (
          <AllianceGrid alliances={list} />
        )}
      </section>
    </main>
  );
}
