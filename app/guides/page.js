import { cookies } from 'next/headers';
import { readMemberSession } from '../../lib/memberAuth';
import { isAdminRequest } from '../../lib/adminAuth';
import { guidesTable } from '../../lib/guideAccess.mjs';
import { getCollection } from '../../lib/mongo';
import { COLLECTIONS } from '../../lib/mongoCollections';
import Link from 'next/link';
import { PageHero, SectionHeader } from '../../components/ui';
import { getPageText } from '../../lib/pageText.server';
import Breadcrumbs from '../../components/Breadcrumbs';
import GuidesDirectory from './GuidesDirectory';
import { guideCategories, guideSummary } from '../../lib/guideValidation.mjs';
import { guideCardImageUrl, visibleCardImageId } from '../../lib/guideImages.mjs';
import { formatGuideDate, guideUpdatedAt } from '../../lib/guideContent.mjs';

export const metadata = {
  title: 'Guides',
  description: 'Kingdom 710 strategy, event, and member guides.',
  alternates: { canonical: '/guides' },
};

export const dynamic = 'force-dynamic';

function guidesCollectionName() {
  const table = typeof guidesTable === 'function' ? guidesTable() : 'kingdom_guides';
  return table === 'guide_content' ? COLLECTIONS.GUIDE_CONTENT : COLLECTIONS.KINGDOM_GUIDES;
}

async function loadGuides() {
  const request = { cookies: await cookies() };
  const allowed = Boolean(await readMemberSession(request)) || (await isAdminRequest(request));
  const coll = await getCollection(guidesCollectionName());
  const filter = { is_published: true };
  if (!allowed) filter.access_level = 'public';

  const data = await coll
    .find(filter)
    .project({
      slug: 1,
      title: 1,
      category: 1,
      description: 1,
      body: 1,
      f2p_content: 1,
      spender_content: 1,
      created_at: 1,
      access_level: 1,
      image_id: 1,
      position: 1,
      updated_at: 1,
      _id: 0,
    })
    .sort({ position: 1, title: 1 })
    .toArray();

  // The picture id stays on the server; the card only gets a same-origin url (or '' = book icon).
  return (data || []).map((row) => { const { image_id: _id, ...guide } = row; return { ...guideSummary(guide), image_url: guideCardImageUrl(visibleCardImageId(row, { canSeeMembers: allowed })) }; });
}

export default async function GuidesPage({ searchParams }) {
  const resolvedSearchParams = await searchParams;
  const memberId = typeof resolvedSearchParams?.member_id === 'string' ? resolvedSearchParams.member_id : '';
  const query = memberId ? `?member_id=${encodeURIComponent(memberId)}` : '';
  const backHref = memberId ? `/dashboard?member_id=${encodeURIComponent(memberId)}` : '/dashboard';

  const t = await getPageText('guides');
  let guides = [];
  let loadError = '';
  let categories = [];
  try {
    guides = await loadGuides();
    const catColl = await getCollection('guide_categories');
    const catRows = await catColl.find({}).project({ name: 1, _id: 0 }).sort({ name: 1 }).toArray();
    categories = guideCategories(guides, catRows || []);
  } catch (error) {
    console.error('guides page load failed', error);
    loadError = t.load_error;
  }

  const categoryCount = categories.length;
  const latest = guides
    .filter((guide) => guide.updated_at)
    .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))[0];

  const directoryCopy = Object.fromEntries(['search_label', 'search_placeholder', 'filter_label', 'filter_all', 'empty_search', 'empty_category', 'badge_start', 'entry_read_suffix', 'entry_updated_prefix', 'entry_open'].map((k) => [k, t[k]]));

  return (
    <main className="theme-realm guides-page">
      <PageHero
        before={<Breadcrumbs items={[{ label: 'Home', href: '/' }]} current="Guides" />}
        eyebrow={t.hero_eyebrow}
        title={t.hero_title}
        lede={t.hero_lede}
        actions={<><a href="#archive">{t.hero_browse_label}</a><Link href="/events">{t.hero_events_label}</Link></>}
        aside={
          <aside className="guides-index" aria-label="Guide summary">
            <div>
              <span>{t.summary_guides_label}</span>
              <strong>{guides.length || '—'}</strong>
            </div>
            <div>
              <span>{t.summary_categories_label}</span>
              <strong>{categoryCount || '—'}</strong>
            </div>
            <div>
              <span>{t.summary_latest_label}</span>
              <strong className="guides-index-small">
                {latest?.updated_at ? formatGuideDate(guideUpdatedAt(latest)) : t.summary_latest_empty}
              </strong>
            </div>
          </aside>
        }
      />

      <section className="guides-intro-band">
        {[1, 2, 3].map((n) => (
          <div key={n}>
            <span className="k-mark">{t[`band_${n}_kicker`]}</span>
            <strong>{t[`band_${n}_title`]}</strong>
            <p>{t[`band_${n}_text`]}</p>
          </div>
        ))}
      </section>

      <section className="guides-archive" id="archive">
        <SectionHeader eyebrow={t.archive_eyebrow} title={t.archive_title} lede={t.archive_lede} className="guides-archive-head" />

        {loadError ? (
          <div className="guides-error">{loadError}</div>
        ) : (
          <GuidesDirectory copy={directoryCopy} categories={categories} guides={guides} query={query} backHref={backHref} />
        )}
      </section>

      <style>{`
        .guides-page{min-height:100vh;background:linear-gradient(180deg,#ead9b9 0%,#ead8b7 44%,#e2c99f 100%);color:#291b11;overflow:hidden}
        .guides-page:before{content:'';position:fixed;inset:0;pointer-events:none;background:radial-gradient(circle at 82% 12%,rgba(176,82,28,.10),transparent 28%),linear-gradient(90deg,rgba(70,43,20,.03) 1px,transparent 1px),linear-gradient(rgba(70,43,20,.025) 1px,transparent 1px);background-size:auto,72px 72px,72px 72px;mix-blend-mode:multiply}
        .guides-index{display:grid;border-top:1px solid rgba(233,209,174,.22)}
        .guides-index>div{display:grid;grid-template-columns:1fr auto;gap:24px;align-items:end;padding:22px 0;border-bottom:1px solid rgba(233,209,174,.18)}
        .guides-index span{color:#cdbfa9;font:600 10px/1.4 var(--font-mono);letter-spacing:.14em;text-transform:uppercase}
        .guides-index strong{font-family:var(--font-display);font-size:34px;color:#f0d5a8}
        .guides-index-small{font-size:18px!important;letter-spacing:.02em}
        .guides-intro-band{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));background:#d2a05f;color:#21150d;border-bottom:1px solid rgba(65,40,19,.2)}
        .guides-intro-band>div{padding:30px clamp(24px,4vw,48px);border-right:1px solid rgba(65,40,19,.2)}
        .guides-intro-band .k-mark{color:#4a2a05}
        .guides-intro-band>div:last-child{border-right:0}
        .guides-intro-band strong{display:block;margin:10px 0 6px;font-family:var(--font-display);font-size:20px}
        .guides-intro-band p{margin:0;color:#4d321c;line-height:1.5}
        .guides-archive{position:relative;z-index:1;width:min(1160px,calc(100% - 48px));margin:0 auto;padding:clamp(70px,9vw,118px) 0 110px}
        .guides-archive-head{margin-bottom:42px;padding-bottom:28px;border-bottom:1px solid rgba(75,47,24,.22)}.guides-archive-head .sh-title{font-size:clamp(34px,5vw,56px)}
        .guides-toolbar{display:flex;gap:24px;flex-wrap:wrap;align-items:end;margin-bottom:26px}
        .guides-search{flex:1 1 320px;max-width:430px;color:#63452f}
        .guides-search span{color:#6b4a31!important}
        .guides-categories{display:flex;flex-wrap:wrap;gap:7px}
        .guides-category-tab{padding:9px 13px;border:1px solid rgba(76,47,23,.2);background:rgba(255,248,235,.26);color:#6a4c34;font-family:var(--font-body);font-size:11px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;cursor:pointer;transition:background .16s ease,border-color .16s ease,color .16s ease}
        .guides-category-tab:hover:not(.is-active){border-color:#a4652d;background:rgba(164,101,45,.16);color:#4a2f17}
        .guides-category-tab:focus-visible{outline:2px solid #a4652d;outline-offset:2px}
        .guides-category-tab.is-active{border-color:#2a1a11;background:#2a1a11;color:#efd5ad;box-shadow:inset 0 0 0 1px rgba(239,213,173,.35)}
        .guides-directory{border-top:1px solid rgba(77,48,24,.24)}
        .guide-entry{display:grid;grid-template-columns:132px minmax(0,1fr) 126px;gap:30px;align-items:center;min-height:176px;padding:24px 8px;text-decoration:none;color:inherit;border-bottom:1px solid rgba(77,48,24,.2);transition:padding .2s ease,background .2s ease}
        .guide-entry:hover,.guide-entry:focus-visible{padding-inline:18px;background:rgba(108,66,30,.055);outline:none}
        .guide-device{height:126px;position:relative;display:grid;place-items:center;isolation:isolate}
        .guide-book{position:relative;z-index:2;width:112px;height:112px;filter:drop-shadow(0 10px 9px rgba(75,42,18,.18));transition:transform .2s ease}
        .guide-photo{position:relative;z-index:2;width:112px;height:112px;object-fit:cover;border-radius:10px;border:1px solid rgba(183,140,66,.55);background:#e0cba3;box-shadow:0 10px 9px -4px rgba(75,42,18,.2);transition:transform .2s ease}
        .guide-device-glow{position:absolute;z-index:1;width:92px;height:92px;border-radius:50%;background:radial-gradient(circle,rgba(159,90,37,.16),transparent 70%);filter:blur(8px)}
        .guide-entry:hover .guide-book,.guide-entry:hover .guide-photo,.guide-entry:focus-visible .guide-book,.guide-entry:focus-visible .guide-photo{transform:translateY(-4px) rotate(-2deg)}
        .guide-entry-copy{display:flex;flex-direction:column;align-items:flex-start;min-width:0}
        .guide-entry-tags{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-bottom:8px}
        .guide-category{color:#9b5a27;font-size:10px;margin:0}
        .guide-tag{display:inline-flex;align-items:center;gap:3px;padding:2px 9px;border-radius:var(--radius-pill,999px);font-family:var(--font-mono);font-size:9.5px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;border:1px solid rgba(76,47,23,.28);background:rgba(255,248,235,.5);color:#6a4c34}
        .guide-tag-start{border-color:#a4652d;background:#f0d5a8;color:#5a3413}
        .guide-tag-beginner{border-color:rgba(77,122,77,.4);background:rgba(77,122,77,.14);color:#3c5e3c}
        .guide-tag-intermediate{border-color:rgba(180,120,40,.4);background:rgba(180,120,40,.14);color:#8a5a1f}
        .guide-tag-advanced{border-color:rgba(179,64,47,.4);background:rgba(179,64,47,.14);color:#8a3221}
        .guide-entry-title{font-family:var(--font-fraunces-loaded),Georgia,serif;font-size:clamp(24px,3vw,34px);line-height:1.02;letter-spacing:-.025em;color:#2b1a10}
        .guide-description{margin-top:9px;color:#72553b;font-size:15px;line-height:1.55;max-width:62ch}
        .guide-entry-sub{margin-top:10px;color:#967452;font-family:var(--font-mono);font-size:10px;letter-spacing:.08em;text-transform:uppercase}
        .guide-entry-meta{display:flex;flex-direction:column;align-items:flex-end;gap:10px;color:#8d562d;font-family:var(--font-mono);font-size:9px;letter-spacing:.1em;text-transform:uppercase}
        .guide-entry-meta b{font-size:25px;font-family:var(--font-body);font-weight:400;color:#8e5229}
        .guides-ledger{margin-top:38px;padding-top:22px;border-top:1px solid rgba(77,48,24,.18);max-width:68ch}
        .guides-ledger p{margin:8px 0 0;color:#765a40;font-size:14px;line-height:1.55}
        .guides-back{display:inline-block;margin-top:34px;color:#754723;font-size:12px;font-weight:800;text-decoration:none;letter-spacing:.05em;text-transform:uppercase}
        .guides-error{padding:26px 0;border-block:1px solid rgba(77,48,24,.2);color:#5a4528}
        @media(max-width:820px){.guides-index{grid-template-columns:repeat(3,1fr)}.guides-index>div{grid-template-columns:1fr;padding:16px}.guides-intro-band{grid-template-columns:1fr}.guides-intro-band>div{border-right:0;border-bottom:1px solid rgba(65,40,19,.2)}.guides-archive-head{grid-template-columns:1fr;gap:18px}.guide-entry{grid-template-columns:96px minmax(0,1fr);gap:18px}.guide-entry-meta{grid-column:2;align-items:flex-start;flex-direction:row}.guide-device{height:100px}.guide-book,.guide-photo{width:90px;height:90px}}
        @media(max-width:560px){.guides-index{grid-template-columns:1fr}.guides-index>div{grid-template-columns:1fr auto}.guides-archive{width:min(100% - 32px,1160px)}.guide-entry{grid-template-columns:1fr;padding:22px 0}.guide-device{display:none}.guide-entry-meta{grid-column:1}.guides-toolbar{align-items:stretch}.guides-search{max-width:none}}
        @media(prefers-reduced-motion:reduce){.guide-entry,.guide-book,.guide-photo{transition:none}}
      `}</style>
    </main>
  );
}
