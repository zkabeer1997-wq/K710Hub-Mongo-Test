import { cookies } from 'next/headers';
import { readMemberSession } from '../../lib/memberAuth';
import { isAdminRequest } from '../../lib/adminAuth';
import { guidesTable } from '../../lib/guideAccess.mjs';
import { createAdminSupabaseClient } from '../../lib/adminSupabase';
import Link from 'next/link';
import GuidesDirectory from './GuidesDirectory';
import { guideCategories, guideSummary } from '../../lib/guideValidation.mjs';

export const metadata = {
  title: 'K710 Guides',
  description: 'Kingdom 710 strategy, event, and member guides.',
  alternates: { canonical: '/guides' },
};

export const dynamic = 'force-dynamic';

async function loadGuides() {
  const request = { cookies: await cookies() };
  const allowed = Boolean(await readMemberSession(request)) || await isAdminRequest(request);
  const supabase = createAdminSupabaseClient();
  let query = supabase
    .from(guidesTable())
    .select('slug, title, category, description, body, access_level, position, updated_at')
    .eq('is_published', true)
    .order('position', { ascending: true })
    .order('title', { ascending: true });
  if (!allowed) query = query.eq('access_level', 'public');
  const { data, error } = await query;

  if (error) throw error;
  return (data || []).map(guideSummary);
}

export default async function GuidesPage({ searchParams }) {
  const resolvedSearchParams = await searchParams;
  const memberId = typeof resolvedSearchParams?.member_id === 'string' ? resolvedSearchParams.member_id : '';
  const query = memberId ? `?member_id=${encodeURIComponent(memberId)}` : '';
  const backHref = memberId ? `/player-record?member_id=${encodeURIComponent(memberId)}` : '/player-record';

  let guides = [];
  let loadError = '';
  let categories = [];
  try {
    guides = await loadGuides();
    const result = await createAdminSupabaseClient().from('guide_categories').select('name').order('name');
    if (result.error) throw result.error;
    categories = guideCategories(guides, result.data || []);
  } catch (error) {
    console.error('guides page load failed', error);
    loadError = 'Guides could not be loaded. Please try again.';
  }

  const categoryCount = categories.length;
  const latest = guides
    .filter((guide) => guide.updated_at)
    .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))[0];

  return (
    <main className="theme-realm guides-page">
      <section className="guides-hero">
        <div className="guides-hero-grid" aria-hidden="true" />
        <div className="guides-hero-copy">
          <span className="k-mark">Kingdom 710</span>
          <h1>Guides</h1>
          <p>
            Read kingdom instructions, event strategies, and game information maintained by the K710 team.
          </p>
          <div className="guides-hero-links">
            <a href="#archive">Browse guides</a>
            <Link href="/events">View events</Link>
          </div>
        </div>

        <aside className="guides-index" aria-label="Guide summary">
          <div>
            <span>Published guides</span>
            <strong>{guides.length || '—'}</strong>
          </div>
          <div>
            <span>Categories</span>
            <strong>{categoryCount || '—'}</strong>
          </div>
          <div>
            <span>Latest revision</span>
            <strong className="guides-index-small">
              {latest?.updated_at ? new Date(latest.updated_at).toLocaleDateString() : 'No revisions yet'}
            </strong>
          </div>
        </aside>
      </section>

      <section className="guides-intro-band">
        <div>
          <span className="k-mark">Kingdom</span>
          <strong>Kingdom information</strong>
          <p>How K710 handles players, rallies, transfers, and preparation.</p>
        </div>
        <div>
          <span className="k-mark">Events</span>
          <strong>Event instructions</strong>
          <p>What to do before and during major events.</p>
        </div>
        <div>
          <span className="k-mark">Search</span>
          <strong>Find a guide</strong>
          <p>Search by title or filter the list by category.</p>
        </div>
      </section>

      <section className="guides-archive" id="archive">
        <div className="guides-archive-head">
          <div>
            <span className="k-mark">All guides</span>
            <h2>Find a guide</h2>
          </div>
          <p>
            Search the published guides below or choose a category.
          </p>
        </div>

        {loadError ? (
          <div className="guides-error">{loadError}</div>
        ) : (
          <GuidesDirectory categories={categories} guides={guides} query={query} backHref={backHref} />
        )}
      </section>

      <style>{`
        .guides-page{min-height:100vh;background:linear-gradient(180deg,#ead9b9 0%,#ead8b7 44%,#e2c99f 100%);color:#291b11;overflow:hidden}
        .guides-page:before{content:'';position:fixed;inset:0;pointer-events:none;background:radial-gradient(circle at 82% 12%,rgba(176,82,28,.10),transparent 28%),linear-gradient(90deg,rgba(70,43,20,.03) 1px,transparent 1px),linear-gradient(rgba(70,43,20,.025) 1px,transparent 1px);background-size:auto,72px 72px,72px 72px;mix-blend-mode:multiply}
        .guides-hero{position:relative;display:grid;grid-template-columns:minmax(0,1.25fr) minmax(280px,.75fr);gap:clamp(36px,6vw,92px);align-items:end;min-height:620px;padding:clamp(80px,10vw,132px) clamp(24px,6vw,92px) 72px;background:linear-gradient(135deg,#17110d 0%,#2b190f 58%,#5d2e17 100%);color:#f4e3c5;overflow:hidden}
        .guides-hero:after{content:'710';position:absolute;right:-2vw;bottom:-8px;font:800 clamp(140px,25vw,360px)/.72 var(--font-display);letter-spacing:-.06em;color:rgba(244,227,197,.035);pointer-events:none}
        .guides-hero-grid{position:absolute;inset:0;background:linear-gradient(90deg,rgba(255,255,255,.028) 1px,transparent 1px),linear-gradient(rgba(255,255,255,.018) 1px,transparent 1px);background-size:72px 72px;mask-image:linear-gradient(90deg,transparent,black 38%,black 100%)}
        .guides-hero-copy,.guides-index{position:relative;z-index:2}
        .guides-hero-copy h1{max-width:760px;margin:16px 0 22px;font-family:var(--font-fraunces-loaded),Georgia,serif;font-size:clamp(54px,7.5vw,104px);line-height:.9;letter-spacing:-.055em;text-transform:none}
        .guides-hero-copy p{max-width:660px;margin:0;color:#c8b79d;font-size:18px;line-height:1.65}
        .guides-hero-links{display:flex;gap:12px;flex-wrap:wrap;margin-top:30px}
        .guides-hero-links a{display:inline-flex;padding:12px 15px;border:1px solid rgba(222,177,111,.36);color:#edd7b4;text-decoration:none;font-size:12px;font-weight:800;letter-spacing:.04em;text-transform:uppercase}
        .guides-hero-links a:first-child{background:#d7a059;color:#1b120d;border-color:#d7a059}
        .guides-index{display:grid;border-top:1px solid rgba(233,209,174,.22)}
        .guides-index>div{display:grid;grid-template-columns:1fr auto;gap:24px;align-items:end;padding:22px 0;border-bottom:1px solid rgba(233,209,174,.18)}
        .guides-index span{color:#978a79;font:600 10px/1.4 var(--font-mono);letter-spacing:.14em;text-transform:uppercase}
        .guides-index strong{font-family:var(--font-display);font-size:34px;color:#f0d5a8}
        .guides-index-small{font-size:18px!important;letter-spacing:.02em}
        .guides-intro-band{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));background:#d2a05f;color:#21150d;border-bottom:1px solid rgba(65,40,19,.2)}
        .guides-intro-band>div{padding:30px clamp(24px,4vw,48px);border-right:1px solid rgba(65,40,19,.2)}
        .guides-intro-band>div:last-child{border-right:0}
        .guides-intro-band strong{display:block;margin:10px 0 6px;font-family:var(--font-display);font-size:20px}
        .guides-intro-band p{margin:0;color:#5d4029;line-height:1.5}
        .guides-archive{position:relative;z-index:1;width:min(1160px,calc(100% - 48px));margin:0 auto;padding:clamp(70px,9vw,118px) 0 110px}
        .guides-archive-head{display:grid;grid-template-columns:minmax(0,1fr) minmax(280px,.75fr);gap:60px;align-items:end;margin-bottom:42px;padding-bottom:28px;border-bottom:1px solid rgba(75,47,24,.22)}
        .guides-archive-head h2{margin:12px 0 0;font-family:var(--font-fraunces-loaded),Georgia,serif;font-size:clamp(42px,6vw,72px);line-height:.95;text-transform:none;letter-spacing:-.045em}
        .guides-archive-head p{margin:0;color:#74583e;line-height:1.65}
        .guides-toolbar{display:flex;gap:24px;flex-wrap:wrap;align-items:end;margin-bottom:26px}
        .guides-search{flex:1 1 320px;max-width:430px;color:#63452f}
        .guides-search span{color:#6b4a31!important}
        .guides-categories{display:flex;flex-wrap:wrap;gap:7px}
        .guides-category-tab{padding:9px 13px;border:1px solid rgba(76,47,23,.2);background:rgba(255,248,235,.26);color:#6a4c34;font-family:var(--font-body);font-size:11px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;cursor:pointer}
        .guides-category-tab:hover,.guides-category-tab.is-active{border-color:#a4652d;background:#2a1a11;color:#efd5ad}
        .guides-directory{border-top:1px solid rgba(77,48,24,.24)}
        .guide-entry{display:grid;grid-template-columns:132px minmax(0,1fr) 126px;gap:30px;align-items:center;min-height:176px;padding:24px 8px;text-decoration:none;color:inherit;border-bottom:1px solid rgba(77,48,24,.2);transition:padding .2s ease,background .2s ease}
        .guide-entry:hover,.guide-entry:focus-visible{padding-inline:18px;background:rgba(108,66,30,.055);outline:none}
        .guide-device{height:126px;position:relative;display:grid;place-items:center;isolation:isolate}
        .guide-book{position:relative;z-index:2;width:112px;height:112px;filter:drop-shadow(0 10px 9px rgba(75,42,18,.18));transition:transform .2s ease}
        .guide-device-glow{position:absolute;z-index:1;width:92px;height:92px;border-radius:50%;background:radial-gradient(circle,rgba(159,90,37,.16),transparent 70%);filter:blur(8px)}
        .guide-entry:hover .guide-book{transform:translateY(-4px) rotate(-2deg)}
        .guide-entry-copy{display:flex;flex-direction:column;align-items:flex-start;min-width:0}
        .guide-category{color:#9b5a27;font-size:10px;margin-bottom:8px}
        .guide-entry-title{font-family:var(--font-fraunces-loaded),Georgia,serif;font-size:clamp(24px,3vw,34px);line-height:1.02;letter-spacing:-.025em;color:#2b1a10}
        .guide-description{margin-top:9px;color:#72553b;font-size:15px;line-height:1.55;max-width:62ch}
        .guide-entry-sub{margin-top:10px;color:#967452;font-family:var(--font-mono);font-size:10px;letter-spacing:.08em;text-transform:uppercase}
        .guide-entry-meta{display:flex;flex-direction:column;align-items:flex-end;gap:10px;color:#8d562d;font-family:var(--font-mono);font-size:9px;letter-spacing:.1em;text-transform:uppercase}
        .guide-entry-meta b{font-size:25px;font-family:var(--font-body);font-weight:400;color:#8e5229}
        .guides-ledger{margin-top:38px;padding-top:22px;border-top:1px solid rgba(77,48,24,.18);max-width:68ch}
        .guides-ledger p{margin:8px 0 0;color:#765a40;font-size:14px;line-height:1.55}
        .guides-back{display:inline-block;margin-top:34px;color:#754723;font-size:12px;font-weight:800;text-decoration:none;letter-spacing:.05em;text-transform:uppercase}
        .guides-error{padding:26px 0;border-block:1px solid rgba(77,48,24,.2);color:#74583e}
        @media(max-width:820px){.guides-hero{grid-template-columns:1fr;min-height:auto;padding-top:82px}.guides-index{grid-template-columns:repeat(3,1fr)}.guides-index>div{grid-template-columns:1fr;padding:16px}.guides-intro-band{grid-template-columns:1fr}.guides-intro-band>div{border-right:0;border-bottom:1px solid rgba(65,40,19,.2)}.guides-archive-head{grid-template-columns:1fr;gap:18px}.guide-entry{grid-template-columns:96px minmax(0,1fr);gap:18px}.guide-entry-meta{grid-column:2;align-items:flex-start;flex-direction:row}.guide-device{height:100px}.guide-book{width:90px;height:90px}}
        @media(max-width:560px){.guides-hero{padding-inline:20px}.guides-hero-copy h1{font-size:50px}.guides-index{grid-template-columns:1fr}.guides-index>div{grid-template-columns:1fr auto}.guides-archive{width:min(100% - 32px,1160px)}.guide-entry{grid-template-columns:1fr;padding:22px 0}.guide-device{display:none}.guide-entry-meta{grid-column:1}.guides-toolbar{align-items:stretch}.guides-search{max-width:none}}
        @media(prefers-reduced-motion:reduce){.guide-entry,.guide-book{transition:none}}
      `}</style>
    </main>
  );
}
