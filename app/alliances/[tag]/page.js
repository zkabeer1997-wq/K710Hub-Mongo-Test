import { stripLegacyBearCopy } from '../../../lib/publicBearSchedule';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createAdminSupabaseClient } from '../../../lib/adminSupabase';
import { Tag, Card, Button } from '../../../components/ui';
import { AllianceBearTimes } from '../../../components/BearScheduleProvider';

const STATUS_LABEL = { open: 'Recruiting', selective: 'Selective', closed: 'Closed' };
const STATUS_TONE = { open: 'success', selective: 'accent', closed: 'neutral' };

// No cookies()/searchParams here - same lesson as PR 7 (guides) and PR 8
// (events): this page has no admin-preview requirement, so there's no
// reason to risk the DYNAMIC_SERVER_USAGE conflict at all.
export async function generateStaticParams() {
  try {
    const supabase = createAdminSupabaseClient();
    const { data, error } = await supabase.from('alliances').select('tag').eq('active', true);
    if (error) throw error;
    return (data || []).map((a) => ({ tag: a.tag.toLowerCase() }));
  } catch (error) {
    console.error('alliances generateStaticParams failed', error);
    return [];
  }
}

async function loadAlliance(tagParam) {
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from('alliances')
    .select('tag, name, blurb, leader_player_id, timezone_focus, recruiting_status, language, roster_size, bear_times_utc')
    .eq('tag', String(tagParam || '').toUpperCase())
    .eq('active', true)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

export async function generateMetadata({ params }) {
  const { tag } = await params;
  const canonical = `/alliances/${String(tag || '').toLowerCase()}`;
  try {
    const alliance = await loadAlliance(tag);
    if (!alliance) return { title: 'Alliance | K710', alternates: { canonical } };
    return { title: `${alliance.name} — K710`, description: alliance.blurb || undefined, alternates: { canonical } };
  } catch {
    return { title: 'Alliance | K710', alternates: { canonical } };
  }
}

export default async function AlliancePage({ params }) {
  const { tag } = await params;
  let alliance = null;
  try {
    alliance = await loadAlliance(tag);
  } catch (error) {
    console.error('alliance page load failed', error);
    // A genuinely missing alliance (bad slug) and a Supabase hiccup are
    // different situations for a visitor - notFound() renders the site's
    // real 404, but a load failure here would too, silently mislabeling a
    // transient error as "this alliance doesn't exist." Surface it as a
    // real error instead of masking it as a 404.
    return (
      <main className="theme-realm alliance-page" style={{ minHeight: '100vh', padding: '56px 24px', background: 'var(--color-bg)', color: 'var(--color-ink)' }}>
        <div className="alliance-page-inner" style={{ maxWidth: 700, margin: '0 auto' }}>
          <Link href="/alliances" className="alliance-back">← Alliances</Link>
          <p className="alliance-blurb" style={{ marginTop: 16 }}>This alliance could not be loaded right now.</p>
        </div>
      </main>
    );
  }
  if (!alliance) notFound();


  return (
    <main className="theme-realm alliance-page">
      <div className="alliance-page-inner">
        <Link href="/alliances" className="alliance-back">← Alliances</Link>

        <div className="alliance-head">
          <Tag band={alliance.tag}>{alliance.tag}</Tag>
          <Tag tone={STATUS_TONE[alliance.recruiting_status] || 'neutral'}>
            {STATUS_LABEL[alliance.recruiting_status] || alliance.recruiting_status}
          </Tag>
        </div>
        <h1 className="alliance-title">{alliance.name}</h1>
        {stripLegacyBearCopy(alliance.blurb) && <p className="alliance-blurb">{stripLegacyBearCopy(alliance.blurb)}</p>}

        <Card className="alliance-facts">
          <div><dt>Timezone focus</dt><dd>{alliance.timezone_focus || 'Not listed'}</dd></div>
          <div><dt>Roster size</dt><dd>{alliance.roster_size != null ? `${alliance.roster_size} members` : 'Not listed'}</dd></div>
          <div><dt>Primary language</dt><dd>{alliance.language || 'Not listed'}</dd></div>
          <div><dt>Leadership contact</dt><dd>{alliance.leader_player_id || 'Not listed'}</dd></div>
        </Card>

        <section className="alliance-windows">
          <h2 className="alliance-section-title">Bear Hunt windows</h2>
          <div className="alliance-windows-list">
            <AllianceBearTimes tag={alliance.tag} initialTimes={alliance.bear_times_utc} />
          </div>
          <Link href="/chronometer" className="alliance-events-link">See all alliance Bear Hunt times →</Link>
        </section>

        <Button href="/interest" variant="struck" className="alliance-cta">Join {alliance.name}</Button>
      </div>

      <style>{`
        .alliance-page{padding:56px 24px 96px;background:var(--color-bg);color:var(--color-ink);min-height:100vh}
        .alliance-page-inner{max-width:700px;margin:0 auto;display:flex;flex-direction:column;gap:16px;align-items:flex-start}
        .alliance-back{color:var(--color-accent-strong);text-decoration:none;font-size:13px;font-weight:700}
        .alliance-back:hover{text-decoration:underline}
        .alliance-head{display:flex;gap:8px;margin-top:8px}
        .alliance-title{margin:4px 0 0;font-family:var(--font-display);font-size:clamp(30px,5vw,48px)}
        .alliance-blurb{margin:0;font-size:16px;color:var(--color-ink-muted);max-width:60ch}
        .alliance-facts{padding:20px;display:flex;flex-direction:column;gap:8px;width:100%}
        .alliance-facts div{display:flex;justify-content:space-between;border-top:1px solid var(--color-border);padding-top:8px}
        .alliance-facts div:first-child{border-top:0;padding-top:0}
        .alliance-facts dt{margin:0;color:var(--color-ink-muted);font-size:13px}
        .alliance-facts dd{margin:0;font-weight:700}
        .alliance-windows{width:100%}
        .alliance-section-title{margin:0 0 10px;font-family:var(--font-display);font-size:18px}
        .alliance-windows-list{display:flex;gap:8px;flex-wrap:wrap}
        .alliance-window-chip{padding:6px 12px;border-radius:var(--radius-pill);background:var(--color-surface-alt);font-family:var(--font-mono);font-size:12px}
        .alliance-events-link{display:inline-block;margin-top:10px;color:var(--color-accent-strong);font-size:13px;font-weight:700;text-decoration:none}
        .alliance-events-link:hover{text-decoration:underline}
        .alliance-cta{margin-top:8px}
      `}</style>
    </main>
  );
}
