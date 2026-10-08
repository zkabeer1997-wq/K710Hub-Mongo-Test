import { stripLegacyBearCopy } from '../../lib/publicBearSchedule';
import Link from 'next/link';
import { AllianceBearTimes } from '../../components/BearScheduleProvider';
import { getPageText } from '../../lib/pageText.server';
import { splitParagraphs } from '../../lib/pageText.mjs';
import EditableSection from '../../components/EditableSection';
import './about.css';
import { getBlocks } from '../../lib/contentBlocks';
import { getCollection } from '../../lib/mongo';
import { COLLECTIONS } from '../../lib/mongoCollections';
import { Tag, PageHero } from '../../components/ui';
import KvkRecord from '../../components/about/KvkRecord';
import { getKvkRecord } from '../../lib/external/index.mjs';

export const metadata = {
  title: 'About',
  description:
    'Kingdom 710 is a multilingual Kingshot kingdom with three alliances: 710, RED and SKY. See our KvK record, alliances and how to join.',
  alternates: { canonical: '/about' },
};

// Where each step's link goes (the words come from Admin > Content > Page text).
const STEP_HREFS = { 1: '/interest', 3: '/help' };

// Plain text from the admin screen: blank line = new paragraph. React escapes it.
function Paras({ text, className }) {
  return splitParagraphs(text).map((p, i) => <p key={i} className={className}>{p}</p>);
}

// Leader line lives in the Home page text as "R5: Name". Only shown if present.
function leaderOf(text) {
  const m = /R5\s*:\s*([^\n]+)/i.exec(text || '');
  return m ? m[1].trim() : '';
}

const STATUS_LABEL = { open: 'Recruiting', selective: 'Selective', closed: 'Closed' };
const STATUS_TONE = { open: 'success', selective: 'accent', closed: 'neutral' };

async function loadAlliances() {
  try {
    const coll = await getCollection(COLLECTIONS.ALLIANCES);
    const data = await coll
      .find({ active: true })
      .project({
        tag: 1,
        name: 1,
        blurb: 1,
        timezone_focus: 1,
        recruiting_status: 1,
        language: 1,
        roster_size: 1,
        bear_times_utc: 1,
        sort_order: 1,
        _id: 0,
      })
      .sort({ sort_order: 1 })
      .toArray();
    return data || [];
  } catch (error) {
    console.error('about alliances load failed', error);
    return [];
  }
}

export default async function AboutPage() {
  const [recordBlocks, sourcesBlocks, alliances, kvkRecord, t, home] = await Promise.all([
    getBlocks('about-record'),
    getBlocks('about-sources'),
    loadAlliances(),
    getKvkRecord(),
    getPageText('about'),
    getPageText('home'), // shared: the extra story paragraphs and R5 leader lines live in the Home page text
  ]);
  const steps = [1, 2, 3].map((n) => ({ n, title: t[`step${n}_title`], body: t[`step${n}_body`], href: STEP_HREFS[n], link: t[`step${n}_link`] }));

  const leaders = { '710': leaderOf(home.wb_1_desc), RED: leaderOf(home.wb_2_desc), SKY: leaderOf(home.wb_3_desc) };
  const hasSources = sourcesBlocks.length > 0;

  return (
    <main className="theme-realm about-page">
      <PageHero
        eyebrow={t.hero_eyebrow}
        title={t.hero_title}
        lede={t.hero_lede}
        actions={<><Link href="/interest" className="about-cta-primary">{t.hero_apply_label}</Link><Link href="/timeline">{t.hero_timeline_label}</Link></>}
        aside={
          <div className="about-standard" role="img" aria-label={`Kingdom 710 banner: ${t.banner_big}, ${t.banner_small}`}>
            <strong aria-hidden="true">{t.banner_big}</strong>
            <span aria-hidden="true">{t.banner_small}</span>
          </div>
        }
      />

      <section className="about-story about-wrap" aria-labelledby="about-story-h">
        <div className="about-story-head">
          <p className="about-kicker">{t.story_kicker}</p>
          <h2 id="about-story-h">{t.story_heading}</h2>
        </div>
        <div className="about-story-body">
          <Paras className="about-story-lead" text={t.story_lead} />
          <Paras text={t.story_second} />
          <Paras text={home.why_2_body} />
          <Paras text={home.why_3_body} />
        </div>
      </section>

      <section className="about-record" id="competitive-record" aria-labelledby="about-record-h">
        <span id="kingdom-rankings" aria-hidden="true" />
        <div className="about-wrap">
          <div className="about-record-head">
            <p className="about-kicker">{t.record_kicker}</p>
            <h2 id="about-record-h">{t.record_heading}</h2>
            <Paras text={t.record_intro} />
          </div>
          <KvkRecord data={kvkRecord} headingId="about-record-sr" />
          {recordBlocks.length > 0 && <EditableSection page="about-record" initialBlocks={recordBlocks} as="div" className="about-editable" />}
        </div>
      </section>

      <section className="about-alliances about-wrap" id="alliances" aria-labelledby="about-alliances-h">
        <div className="about-section-head">
          <p className="about-kicker">{t.alliances_kicker}</p>
          <h2 id="about-alliances-h">{t.alliances_heading}</h2>
          <Paras text={t.alliances_intro} />
        </div>
        {alliances.length === 0 ? (
          <p className="about-empty">The alliance directory is unavailable right now. Please try again shortly.</p>
        ) : (
          <ol className="about-alliance-list">
            {alliances.map((a) => {
              const blurb = stripLegacyBearCopy(a.blurb);
              const leader = leaders[a.tag];
              return (
                <li key={a.tag} className="about-alliance">
                  <div className="about-alliance-id">
                    <Tag band={a.tag}>{a.tag}</Tag>
                    <h3><Link href={`/alliances/${String(a.tag).toLowerCase()}`}>{a.name}</Link></h3>
                    <Tag tone={STATUS_TONE[a.recruiting_status] || 'neutral'}>{STATUS_LABEL[a.recruiting_status] || a.recruiting_status}</Tag>
                  </div>
                  <div className="about-alliance-main">
                    {blurb && <p className="about-alliance-blurb">{blurb}</p>}
                    <p className="about-alliance-meta">
                      {[leader && `R5: ${leader}`, a.timezone_focus, a.language, a.roster_size != null && `${a.roster_size} members`].filter(Boolean).join(' · ')}
                    </p>
                    <Link className="about-more" href={`/alliances/${String(a.tag).toLowerCase()}`}>View {a.tag}<span aria-hidden="true"> →</span></Link>
                  </div>
                  <div className="about-alliance-times">
                    <p className="about-mini-label">Bear Hunts</p>
                    <AllianceBearTimes tag={a.tag} initialTimes={a.bear_times_utc} />
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      {hasSources && (
        <section className="about-wrap about-sources" aria-labelledby="about-sources-h">
          <h2 id="about-sources-h" className="about-h-small">More sources</h2>
          <EditableSection page="about-sources" initialBlocks={sourcesBlocks} as="div" className="about-editable" />
        </section>
      )}

      <section className="about-join about-wrap" id="how-to-transfer" aria-labelledby="about-join-h">
        <div className="about-join-intro">
          <p className="about-kicker">{t.join_kicker}</p>
          <h2 id="about-join-h">{t.join_heading}</h2>
          <ol className="about-steps">
            {steps.map((s, i) => (
              <li key={s.n}>
                <span className="about-step-n" aria-hidden="true">{i + 1}</span>
                <div>
                  <h3>{s.title}</h3>
                  <Paras text={s.body} />
                  {s.href && s.link && <Link className="about-more" href={s.href}>{s.link}<span aria-hidden="true"> →</span></Link>}
                </div>
              </li>
            ))}
          </ol>
        </div>
        <div className="about-faq" aria-labelledby="about-faq-h">
          <h3 id="about-faq-h" className="about-h-small">{t.faq_heading}</h3>
          {t.faq.map((item, i) => (
            <details key={i}>
              <summary>{item.q}</summary>
              <Paras text={item.a} />
            </details>
          ))}
        </div>
      </section>

      <section className="about-close about-wrap" aria-labelledby="about-close-h">
        <h2 id="about-close-h">{t.close_heading}</h2>
        <Paras text={t.close_line} />
        <Link href="/interest" className="ui-btn">{t.close_button}</Link>
      </section>
    </main>
  );
}
