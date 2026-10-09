import Link from 'next/link';
import AllianceGrid from '../../components/alliances/AllianceGrid';
import { loadLandingAlliances } from '../../lib/alliancesPublic.server';
import { getPageText } from '../../lib/pageText.server';
import { splitParagraphs } from '../../lib/pageText.mjs';
import EditableSection from '../../components/EditableSection';
import './about.css';
import { getBlocks } from '../../lib/contentBlocks';
import { PageHero } from '../../components/ui';
import KvkRecord from '../../components/about/KvkRecord';
import { getKvkRecord } from '../../lib/external/index.mjs';

export const metadata = {
  title: 'About',
  description:
    'Kingdom 710 is a multilingual Kingshot kingdom with coordinated alliances, each with its own Bear Hunt times. See our KvK record, alliances and how to join.',
  alternates: { canonical: '/about' },
};

// Where each step's link goes (the words come from Admin > Content > Page text).
const STEP_HREFS = { 1: '/interest', 3: '/help' };

// Plain text from the admin screen: blank line = new paragraph. React escapes it.
function Paras({ text, className }) {
  return splitParagraphs(text).map((p, i) => <p key={i} className={className}>{p}</p>);
}

async function loadAlliances() {
  try {
    return await loadLandingAlliances();
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
          <>
            <AllianceGrid alliances={alliances} compact />
            <Link className="about-more" href="/alliances">See every alliance, its leaders and Bear Hunt times<span aria-hidden="true"> →</span></Link>
          </>
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
