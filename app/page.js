import { Fragment } from 'react';
import { cookies } from 'next/headers';
import PublicBearAlliances from '../components/PublicBearAlliances';
import { loadPublicBearScheduleOrNull, bearAllianceNotes, stripLegacyBearCopy } from '../lib/publicBearSchedule';
import { buildBearNotes } from '../lib/allianceNotes.mjs';
import { loadLandingAlliances } from '../lib/alliancesPublic.server';
import Link from 'next/link';
import { getPageText } from '../lib/pageText.server';
import HomeForgeIntro from '../components/kingdom/world/HomeForgeIntro';
import RealmShieldLoader from '../components/kingdom/world/RealmShieldLoader';
import GalleryCarousel from '../components/gallery/GalleryCarousel';
import { getGalleryImages } from '../lib/gallery';
import NextBearHunt from '../components/NextBearHunt';
import { getMemberHome } from '../lib/memberHome.server';
import { getKvkRecord } from '../lib/external/index.mjs';
import SectionHeader from '../components/ui/SectionHeader';
import { jsonLdString, organizationJsonLd, websiteJsonLd } from '../lib/jsonLd';
import './home-extras.css';

export const metadata = {
  title: { absolute: 'K710 Hub · Kingdom 710' },
  description: 'The Kingdom 710 website for alliance schedules, events, member forms, guides, upgrade tools, and transfer applications.',
  alternates: { canonical: '/' },
};

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;



const DOCTRINE = [
  { n: 'I', titleKey: 'why_1_title', bodyKey: 'why_1_body' },
  { n: 'II', titleKey: 'why_2_title', bodyKey: 'why_2_body' },
  { n: 'III', titleKey: 'why_3_title', bodyKey: 'why_3_body' },
];

// Words come from Admin > Content > Page text (Home); the links and numbers stay here.
const COMMAND = [
  { n: '01', href: '/events', titleKey: 'cmd_1_title', subKey: 'cmd_1_sub' },
  { n: '02', href: '/guides', titleKey: 'cmd_2_title', subKey: 'cmd_2_sub' },
  { n: '03', href: '/tools', titleKey: 'cmd_3_title', subKey: 'cmd_3_sub' },
  { n: '04', href: '/power-profile', titleKey: 'cmd_4_title', subKey: 'cmd_4_sub' },
];

const STRIP = [
  { n: '01', labelKey: 'strip_1_label', textKey: 'strip_1_text' },
  { n: '02', labelKey: 'strip_2_label', textKey: 'strip_2_text' },
  { n: '03', labelKey: 'strip_3_label', textKey: 'strip_3_text' },
];

const MEMBER_QUICK_LINKS = [
  { href: '/power-profile', label: 'Power Profile' },
  { href: '/forms', label: 'Forms' },
  { href: '/events', label: 'Events' },
  { href: '/tools', label: 'Tools' },
];

export default async function HomePage() {
  const t = await getPageText('home');
  const bearAlliances = await loadPublicBearScheduleOrNull();
  let member = null;
  try {
    const cookieStore = await cookies();
    member = await getMemberHome(cookieStore, (bearAlliances || []).map((a) => a.tag));
  } catch {
    member = null;
  }
  const isMember = !!member;
  // Live KvK figures (Optimizer snapshot); falls back to the dated defaults in lib/kingdomExternalData.mjs.
  const kvk = isMember ? null : await getKvkRecord();
  let galleryImages = [];
  try { galleryImages = await getGalleryImages({ limit: 10 }); } catch (error) { console.error('homepage gallery load failed', error); }
  // Notes: the Home page text for the original three (unchanged), otherwise built from the alliance record.
  let details = {};
  try { details = Object.fromEntries((await loadLandingAlliances()).map((a) => [a.tag, a])); } catch { details = {}; }
  const content = { 'wb-1-desc': { text: t.wb_1_desc }, 'wb-2-desc': { text: t.wb_2_desc }, 'wb-3-desc': { text: t.wb_3_desc } };

  return (
    <main className="theme-realm home-v2">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(organizationJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(websiteJsonLd) }} />
      <HomeForgeIntro />

      <section className="home-v2-hero">
        <div className="home-v2-sun" />
        <div className="home-v2-mountain home-v2-mountain-back" />
        <div className="home-v2-mountain home-v2-mountain-front" />
        <div className="home-v2-citadel"><i/><i/><i/></div>
        <div className="home-v2-forge-beam" />

        <div className="home-v2-copy">
          {isMember ? (
            <>
              <span className="k-mark">Kingdom 710</span>
              <h1>{member.name ? `Welcome back, ${member.name}.` : 'Welcome back.'}</h1>
              <p>{t.member_intro}</p>
              <div className="home-v2-actions home-v2-actions-member">
                {MEMBER_QUICK_LINKS.map((link) => (
                  <Link key={link.href} href={link.href} className="home-v2-secondary">{link.label}</Link>
                ))}
              </div>
            </>
          ) : (
            <>
              <span className="k-mark">{t.hero_kicker}</span>
              <h1>{t.hero_title}</h1>
              <p>{t.hero_sub}</p>
              <div className="home-v2-actions">
                <Link href="/interest" className="home-v2-primary">{t.hero_apply_label}</Link>
                <a href="#alliances" className="home-v2-secondary">{t.hero_schedules_label}</a>
              </div>
              <dl className="home-v2-facts" aria-label="Kingdom 710 at a glance">
                <div><dt>{t.fact_alliances_label}</dt><dd>3</dd></div>
                <div><dt>{t.fact_record_label}</dt><dd>{kvk.record.wins}–{kvk.record.losses}</dd></div>
                <div><dt>{t.fact_rank_label}</dt><dd>#{kvk.ranking.rank}</dd></div>
              </dl>
            </>
          )}
        </div>

        <RealmShieldLoader />

      </section>

      {isMember && (
        <section className="home-v2-member" aria-label="Your Kingdom 710 dashboard">
          <div className="home-v2-member-hunt">
            <NextBearHunt alliances={bearAlliances || []} allianceTag={member.allianceTag} />
          </div>
          <div className="home-v2-member-forms">
            <h2>{member.outstanding.length ? (member.outstanding.length === 1 ? '1 thing to do' : `${member.outstanding.length} things to do`) : 'Outstanding forms'}</h2>
            {member.outstanding.length ? (
              <ul>
                {member.outstanding.map((form) => (
                  <li key={form.key}>
                    <Link href={form.href}><span>{form.title}</span><em>{form.note}</em></Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p>You are up to date. Nothing is waiting on you right now.</p>
            )}
            <Link href="/forms" className="home-v2-story-link">All forms →</Link>
          </div>
        </section>
      )}

      <section className="home-v2-story">
        <div className="home-v2-story-scene home-v2-story-gallery"><GalleryCarousel images={galleryImages} embedded /></div>
        <div className="home-v2-story-copy">
          <SectionHeader eyebrow={t.why_head_kicker} title={t.why_head_title} lede={t.why_head_sub} />
          <div className="home-v2-doctrine">
            {DOCTRINE.map((d) => <div key={d.n}><b>{d.n}</b><span><strong>{t[d.titleKey]}</strong><small>{t[d.bodyKey]}</small></span></div>)}
          </div>
          <Link href="/about" className="home-v2-story-link">{t.story_link} →</Link>
        </div>
      </section>

      <section className="home-v2-strip">
        {STRIP.map((item) => <div key={item.n}><span>{item.n}</span><b>{t[item.labelKey]}</b><p>{t[item.textKey]}</p></div>)}
      </section>

      <section className="home-v2-command">
        <div className="home-v2-command-copy">
          <SectionHeader eyebrow={t.deck_head_kicker} title={t.deck_head_title} lede={t.deck_head_sub} />
        </div>
        <div className="home-v2-command-list">
          {COMMAND.map((item) => (
            <Link key={item.href} href={item.href}><b>{item.n}</b><span><strong>{t[item.titleKey]}</strong><small>{t[item.subKey]}</small></span><i>↗</i></Link>
          ))}
        </div>
      </section>

      <section className="home-v2-alliances" id="alliances">
        <SectionHeader eyebrow={t.wb_head_kicker} title={t.wb_head_title} />
        <PublicBearAlliances initialAlliances={bearAlliances} notes={buildBearNotes({ alliances: bearAlliances || [], textNotes: bearAllianceNotes(content), details, stripBlurb: stripLegacyBearCopy })} />
      </section>

      <section className="home-v2-final">
        <div><span className="k-mark">{t.final_kicker}</span><h2>{t.final_title.split('\n').map((line, i) => <Fragment key={i}>{i > 0 && <br />}{line}</Fragment>)}</h2></div>
        <Link href="/interest">{t.final_button}</Link>
      </section>
    </main>
  );
}
