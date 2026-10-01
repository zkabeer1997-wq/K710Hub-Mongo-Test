import { stripLegacyBearCopy } from '../../../lib/publicBearSchedule';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getCollection } from '../../../lib/mongo';
import { COLLECTIONS } from '../../../lib/mongoCollections';
import { Tag, Card, Button, PageHero, SectionHeader } from '../../../components/ui';
import { AllianceBearTimes } from '../../../components/BearScheduleProvider';

const STATUS_LABEL = { open: 'Recruiting', selective: 'Selective', closed: 'Closed' };
const STATUS_TONE = { open: 'success', selective: 'accent', closed: 'neutral' };

// No cookies()/searchParams here - same lesson as PR 7 (guides) and PR 8
// (events): this page has no admin-preview requirement, so there's no
// reason to risk the DYNAMIC_SERVER_USAGE conflict at all.
export async function generateStaticParams() {
  try {
    const coll = await getCollection(COLLECTIONS.ALLIANCES);
    const data = await coll.find({ active: true }).project({ tag: 1, _id: 0 }).toArray();
    return (data || []).map((a) => ({ tag: String(a.tag).toLowerCase() }));
  } catch (error) {
    console.error('alliances generateStaticParams failed', error);
    return [];
  }
}

async function loadAlliance(tagParam) {
  const coll = await getCollection(COLLECTIONS.ALLIANCES);
  return coll.findOne(
    { tag: String(tagParam || '').toUpperCase(), active: true },
    {
      projection: {
        tag: 1,
        name: 1,
        blurb: 1,
        leader_player_id: 1,
        timezone_focus: 1,
        recruiting_status: 1,
        language: 1,
        roster_size: 1,
        bear_times_utc: 1,
        _id: 0,
      },
    }
  );
}

export async function generateMetadata({ params }) {
  const { tag } = await params;
  const canonical = `/alliances/${String(tag || '').toLowerCase()}`;
  try {
    const alliance = await loadAlliance(tag);
    if (!alliance) return { title: 'Alliance', alternates: { canonical } };
    return { title: alliance.name, description: alliance.blurb || undefined, alternates: { canonical } };
  } catch {
    return { title: 'Alliance', alternates: { canonical } };
  }
}

export default async function AlliancePage({ params }) {
  const { tag } = await params;
  let alliance = null;
  try {
    alliance = await loadAlliance(tag);
  } catch (error) {
    console.error('alliance page load failed', error);
    return (
      <main className="theme-realm alliance-page" style={{ minHeight: '100vh', background: 'var(--color-bg)', color: 'var(--color-ink)' }}>
        <PageHero eyebrow="Kingdom 710 alliance" title="Alliance" lede="This alliance could not be loaded right now." actions={<Link href="/about#alliances">← All alliances</Link>} />
      </main>
    );
  }
  if (!alliance) notFound();

  return (
    <main className="theme-realm alliance-page">
      <PageHero
        eyebrow={`Kingdom 710 alliance · ${alliance.tag}`}
        title={alliance.name}
        lede={stripLegacyBearCopy(alliance.blurb) || undefined}
        actions={<Link href="/about#alliances">← All alliances</Link>}
        aside={
          <div className="alliance-head">
            <Tag band={alliance.tag}>{alliance.tag}</Tag>
            <Tag tone={STATUS_TONE[alliance.recruiting_status] || 'neutral'}>
              {STATUS_LABEL[alliance.recruiting_status] || alliance.recruiting_status}
            </Tag>
          </div>
        }
      />
      <div className="alliance-page-inner">
        <Card className="alliance-facts">
          <div><dt>Timezone focus</dt><dd>{alliance.timezone_focus || 'Not listed'}</dd></div>
          <div><dt>Roster size</dt><dd>{alliance.roster_size != null ? `${alliance.roster_size} members` : 'Not listed'}</dd></div>
          <div><dt>Primary language</dt><dd>{alliance.language || 'Not listed'}</dd></div>
          <div><dt>Leadership contact</dt><dd>{alliance.leader_player_id || 'Not listed'}</dd></div>
        </Card>

        <section className="alliance-windows">
          <SectionHeader title="Bear Hunt windows" className="alliance-sh" />
          <div className="alliance-windows-list">
            <AllianceBearTimes tag={alliance.tag} initialTimes={alliance.bear_times_utc} />
          </div>
          <Link href="/about#alliances" className="alliance-events-link">See all alliance Bear Hunt times →</Link>
        </section>

        <Button href="/interest" variant="struck" className="alliance-cta">Join {alliance.name}</Button>
      </div>

      <style>{`
        .alliance-page{padding:0 0 96px;background:var(--color-bg);color:var(--color-ink);min-height:100vh}
        .alliance-page-inner{max-width:700px;margin:0 auto;padding:48px 24px 0;display:flex;flex-direction:column;gap:16px;align-items:flex-start}
        .alliance-head{display:flex;gap:8px;flex-wrap:wrap}
        .alliance-blurb{margin:0;font-size:16px;color:var(--color-ink-muted);max-width:60ch}
        .alliance-facts{padding:20px;display:flex;flex-direction:column;gap:8px;width:100%}
        .alliance-facts div{display:flex;justify-content:space-between;border-top:1px solid var(--color-border);padding-top:8px}
        .alliance-facts div:first-child{border-top:0;padding-top:0}
        .alliance-facts dt{margin:0;color:var(--color-ink-muted);font-size:13px}
        .alliance-facts dd{margin:0;font-weight:700}
        .alliance-windows{width:100%}
        .alliance-sh{margin-bottom:var(--space-3)}.alliance-sh .sh-title{font-size:24px}
        .alliance-windows-list{display:flex;gap:8px;flex-wrap:wrap}
        .alliance-window-chip{padding:6px 12px;border-radius:var(--radius-pill);background:var(--color-surface-alt);font-family:var(--font-mono);font-size:12px}
        .alliance-events-link{display:inline-block;margin-top:10px;color:var(--color-link);font-size:13px;font-weight:700;text-decoration:none}
        .alliance-events-link:hover{text-decoration:underline}
        .alliance-cta{margin-top:8px}
      `}</style>
    </main>
  );
}
