import { stripLegacyBearCopy } from '../../lib/publicBearSchedule';
import Link from 'next/link';
import { AllianceBearTimes } from '../../components/BearScheduleProvider';
import EditableSection from '../../components/EditableSection';
import './about.css';
import { getBlocks } from '../../lib/contentBlocks';
import { getHomeContent } from '../../lib/homeContent';
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

const STEPS = [
  { title: 'Send your application', body: 'Fill in the transfer form with your battle report screenshots and the details it asks for.', href: '/interest', link: 'Open the form' },
  { title: 'Get reviewed', body: 'The council checks your account, preferred event times and KvK plans, then tells you which alliance fits.' },
  { title: 'Move in when a window opens', body: 'Transfer when your intake window lands and get added to your alliance’s Bear Hunt schedule.', href: '/help', link: 'Read the help guide' },
];

// Leader line lives in the editable home copy as "R5: Name". Only shown if present.
function leaderOf(text) {
  const m = /R5\s*:\s*([^\n]+)/i.exec(text || '');
  return m ? m[1].trim() : '';
}

const FAQ = [
  {
    q: 'How long does the transfer take?',
    a: 'Most transfers are reviewed within a day or two. New intake windows open regularly — apply now and we will confirm your place when the next window lands.',
  },
  {
    q: 'Do I need to leave my current alliance first?',
    a: 'No. Send your application first. Leadership will walk you through the timing so you do not lose progress or leave before there is a spot ready for you.',
  },
  {
    q: 'What happens after I apply?',
    a: 'Your application goes to the council, who review your account, preferred event times, and KvK plans. You will be contacted about migration and which of the three alliances fits you best.',
  },
  {
    q: 'Who do I contact if I have questions?',
    a: 'The transfer form has a contact field, and our leadership monitors it daily. Ask anything there — no question is too small before you commit to moving.',
  },
];

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
  const [recordBlocks, sourcesBlocks, homeContent, alliances, kvkRecord] = await Promise.all([
    getBlocks('about-record'),
    getBlocks('about-sources'),
    getHomeContent(),
    loadAlliances(),
    getKvkRecord(),
  ]);

  const leaders = { '710': leaderOf(homeContent['wb-1-desc']?.text), RED: leaderOf(homeContent['wb-2-desc']?.text), SKY: leaderOf(homeContent['wb-3-desc']?.text) };
  const hasSources = sourcesBlocks.length > 0;

  return (
    <main className="theme-realm about-page">
      <PageHero
        eyebrow="About Kingdom 710"
        title="Three alliances. One kingdom."
        lede="Kingdom 710 is a multilingual Kingshot kingdom made up of three alliances: 710, RED and SKY. We prepare for KvK together, run daily Bear Hunts, and share the same events, guides, forms and member tools."
        actions={<><Link href="/interest" className="about-cta-primary">Apply to join</Link><Link href="/timeline">See the timeline</Link></>}
        aside={
          <div className="about-standard" role="img" aria-label="Kingdom 710 banner: 710, RED, SKY">
            <strong aria-hidden="true">710</strong>
            <span aria-hidden="true">710 · RED · SKY</span>
          </div>
        }
      />

      <section className="about-story about-wrap" aria-labelledby="about-story-h">
        <div className="about-story-head">
          <p className="about-kicker">The kingdom</p>
          <h2 id="about-story-h">How we run things</h2>
        </div>
        <div className="about-story-body">
          <p className="about-story-lead">We coordinate across three alliances so every player can find a Bear Hunt time that fits their day, and so KvK is fought as one kingdom.</p>
          <p>Each alliance has its own Bear Hunt schedule, shown below in UTC and in your local time. Pick the one that works for you.</p>
          {homeContent['why-2-body']?.text && <p>{homeContent['why-2-body'].text}</p>}
          {homeContent['why-3-body']?.text && <p>{homeContent['why-3-body'].text}</p>}
        </div>
      </section>

      <section className="about-record" id="competitive-record" aria-labelledby="about-record-h">
        <span id="kingdom-rankings" aria-hidden="true" />
        <div className="about-wrap">
          <div className="about-record-head">
            <p className="about-kicker">Proof on the field</p>
            <h2 id="about-record-h">Our KvK record</h2>
            <p>Kingdom vs Kingdom results and rankings, updated automatically from public Kingshot sites.</p>
          </div>
          <KvkRecord data={kvkRecord} headingId="about-record-sr" />
          {recordBlocks.length > 0 && <EditableSection page="about-record" initialBlocks={recordBlocks} as="div" className="about-editable" />}
        </div>
      </section>

      <section className="about-alliances about-wrap" id="alliances" aria-labelledby="about-alliances-h">
        <div className="about-section-head">
          <p className="about-kicker">The alliances</p>
          <h2 id="about-alliances-h">710, RED and SKY</h2>
          <p>Each alliance has its own Bear Hunt times, languages and recruiting status. Open one to see its schedule and leadership.</p>
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
          <p className="about-kicker">Join us</p>
          <h2 id="about-join-h">How to join in three steps</h2>
          <ol className="about-steps">
            {STEPS.map((s, i) => (
              <li key={s.title}>
                <span className="about-step-n" aria-hidden="true">{i + 1}</span>
                <div>
                  <h3>{s.title}</h3>
                  <p>{s.body}</p>
                  {s.href && <Link className="about-more" href={s.href}>{s.link}<span aria-hidden="true"> →</span></Link>}
                </div>
              </li>
            ))}
          </ol>
        </div>
        <div className="about-faq" aria-labelledby="about-faq-h">
          <h3 id="about-faq-h" className="about-h-small">Common questions</h3>
          {FAQ.map((item) => (
            <details key={item.q}>
              <summary>{item.q}</summary>
              <p>{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="about-close about-wrap" aria-labelledby="about-close-h">
        <h2 id="about-close-h">Ready to move?</h2>
        <p>The council reviews every application.</p>
        <Link href="/interest" className="ui-btn">Apply to join</Link>
      </section>
    </main>
  );
}
