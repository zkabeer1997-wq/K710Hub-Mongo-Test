import PublicBearAlliances from '../components/PublicBearAlliances';
import { loadPublicBearScheduleOrNull, bearAllianceNotes } from '../lib/publicBearSchedule';
import Link from 'next/link';
import HomeEditableText from '../components/HomeEditableText';
import { getHomeContent, checkIsAdmin } from '../lib/homeContent';
import HomeForgeIntro from '../components/kingdom/world/HomeForgeIntro';
import RealmShieldLoader from '../components/kingdom/world/RealmShieldLoader';
import GalleryCarousel from '../components/gallery/GalleryCarousel';
import { getGalleryImages } from '../lib/gallery';

export const metadata = {
  title: { absolute: 'Kingdom 710 · Kingshot' },
  description: 'The Kingdom 710 website for alliance schedules, events, member forms, guides, upgrade tools, and transfer applications.',
  alternates: { canonical: '/' },
};

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;



const DOCTRINE = [
  { n: 'I', titleKey: 'why-1-title', bodyKey: 'why-1-body' },
  { n: 'II', titleKey: 'why-2-title', bodyKey: 'why-2-body' },
  { n: 'III', titleKey: 'why-3-title', bodyKey: 'why-3-body' },
];

const COMMAND = [
  { n: '01', href: '/events', title: 'Events', sub: 'Bear Hunts, KvK, and alliance events' },
  { n: '02', href: '/guides', title: 'Guides', sub: 'Kingdom guides and game information' },
  { n: '03', href: '/tools', title: 'Tools', sub: 'Upgrade and event calculators' },
  { n: '04', href: '/power-profile', title: 'Power Profile', sub: 'Update your gear, charms, heroes, and troops' },
];

// Replace only the older promotional copy. If an admin writes something new,
// their version wins automatically because it no longer matches these strings.
const COPY_REWRITES = {
  'hero-kicker': {
    from: ['KINGDOM 710 · KINGSHOT'],
    to: 'Kingshot · Kingdom 710',
  },
  'hero-title': {
    from: ['Rebuild the realm. Rule the server.', 'Welcome to the Hub of Kingdom 710!', 'Play hard. Stay for the people.'],
    to: 'Welcome to Kingdom 710.',
  },
  'hero-sub': {
    from: [
      "710 is a KvK-first kingdom run across three coordinated alliances, with Bear Hunt coverage spanning every timezone and war-room tooling most kingdoms never bother building. If you're shopping for your next server, start here.",
      "710 is a KvK-first kingdom run across three coordinated alliances, with Bear Hunt coverage spanning every timezone and war-room tooling most kingdoms never bother building. If you're looking for your next server, start here.",
      '710 is home to three alliances and players across every time zone. We show up for KvK, help each other grow, and keep the game fun.',
    ],
    to: 'We are a multilingual Kingshot kingdom with three alliances: 710, RED, and SKY. Use this site to check events, update your player profile, plan upgrades, or apply for a transfer.',
  },
  'deck-head-kicker': {
    from: ['ALREADY IN 710?'],
    to: 'Member links',
  },
  'deck-head-title': {
    from: ['Command deck', 'Rally Joiners and Leads', 'Everything 710 uses'],
    to: 'What do you need?',
  },
  'deck-head-sub': {
    from: ['Quick access to the tools your alliance uses every KvK cycle.', 'Open your profile, event schedule, guides, and upgrade tools.'],
    to: 'Go directly to the most-used parts of the website.',
  },
  'why-head-kicker': {
    from: ['WHY GOVERN WITH US'],
    to: 'About the kingdom',
  },
  'why-head-title': {
    from: ['Built for players who take KvK seriously', 'Built for players who take Kingshot seriously (mostly)', 'Competitive when it matters. Relaxed the rest of the time.'],
    to: 'How 710 works',
  },
  'why-head-sub': {
    from: [
      "Not another spreadsheet-and-hope operation. Here's what's actually different about how 710 runs.",
      "Not another spreadsheet-and-hope kingdom. Here's what's actually different about how 710 runs.",
      'We want active players, good teammates, and a kingdom people actually enjoy logging into.',
    ],
    to: 'We coordinate across three alliances. Players share event information, prepare together for KvK, and use the same member tools on this site.',
  },
  'why-1-title': {
    from: ['Coverage in every timezone', 'Someone is always online'],
    to: 'Seven Bear Hunt times',
  },
  'why-1-body': {
    from: [
      'Three alliances, seven Bear Hunt windows spread across the clock. Whenever you log in, somebody in 710 is already rallying.',
      'Three Alliances, seven Bear Hunt times spread across the world. Whenever you log in, somebody in 710 is already rallying.',
      'Seven Bear Hunt times across 710, RED, and SKY make it easier to find a schedule that works for you.',
    ],
    to: 'The schedules are spread across different time zones. Check the Events page to find the alliance and hunt time that work for you.',
  },
  'why-2-title': {
    from: ['Vetted for commitment, not just power', 'Activity matters more than a power number'],
    to: 'Transfers are reviewed',
  },
  'why-2-body': {
    from: [
      'Our transfer review looks at T11 troop levels, Mystic Trial stages, and KvK-prep habits — because a kingdom of quiet whales loses to a kingdom that shows up.',
      'We look for players who join events, prepare for KvK, and help their alliance. Big accounts are useful; reliable teammates are better.',
    ],
    to: 'We review your account, preferred event times, and KvK participation before confirming a place. The transfer form explains what information is required.',
  },
  'why-3-title': {
    from: ['Real war-room tooling', 'Useful tools for members'],
    to: 'One website for member tasks',
  },
  'why-3-body': {
    from: [
      'Rally roster tracking, King Skill scheduling, and live power profiles — purpose-built for this kingdom, not a shared Google Sheet from three seasons ago.',
      'Update your power profile, plan upgrades, check event times, and complete KvK forms without digging through old messages.',
    ],
    to: 'Members can update their power profile, submit KvK availability, check events, read guides, and use the upgrade calculators here.',
  },
  'wb-head-kicker': {
    from: ['THE THREE ALLIANCES'],
    to: 'Alliance schedules',
  },
  'wb-head-title': {
    from: ['Pick your alliance, know your hunt times', 'Pick your alliance, find your hunt times', 'Seven Bear Hunts. Three homes.'],
    to: '710, RED, and SKY',
  },
  'wb-head-sub': {
    from: [
      "Every alliance runs its own Bear Hunt schedule. Migration preference is part of the application — here's what each one covers.",
      'Choose the alliance whose schedule and community fit you best. You can review every hunt time before you apply.',
    ],
    to: 'Each alliance has different Bear Hunt times. Open an alliance page to see its current schedule and leadership.',
  },
  'wb-1-desc': {
    from: [
      'Two hunts a day, anchoring the early and midday windows.',
      'Two hunts a day, anchoring the early and midday windows.\n\nR5: Yumin',
    ],
    to: 'Two Bear Hunts each day.\n\nR5: Yumin',
  },
  'wb-2-desc': {
    from: [
      'Three hunts, running from EU evening through NA late night.',
      'Three hunts, running from EU evening through NA late night.\n\nR5: Woff',
    ],
    to: 'Three Bear Hunts each day.\n\nR5: Woff',
  },
  'wb-3-desc': {
    from: [
      'Two hunts anchoring the SEA / AU daytime window.',
      'Two hunts anchoring the SEA / AU daytime window.\n\nR5: Asriellexx',
    ],
    to: 'Two Bear Hunts each day.\n\nR5: Asriellexx',
  },
};

export default async function HomePage() {
  const content = await getHomeContent();
  const bearAlliances = await loadPublicBearScheduleOrNull();
  const isAdmin = await checkIsAdmin();
  let galleryImages = [];
  try { galleryImages = await getGalleryImages({ limit: 10 }); } catch (error) { console.error('homepage gallery load failed', error); }
  const field = (key, props = {}) => {
    if (key === 'why-1-title') return 'Alliance Bear Hunt times';
    if (key === 'why-1-body') return 'Check each alliance’s current UTC schedule below to find the times that work for you.';
    const c = content[key] || { id: null, text: '' };
    const rewrite = COPY_REWRITES[key];
    const initialText = rewrite && (!c.text.trim() || rewrite.from.includes(c.text.trim())) ? rewrite.to : c.text;
    return <HomeEditableText id={c.id} fieldKey={key} initialText={initialText} isAdmin={isAdmin} {...props} />;
  };

  return (
    <main className="theme-realm home-v2">
      <HomeForgeIntro />

      <section className="home-v2-hero">
        <div className="home-v2-sun" />
        <div className="home-v2-mountain home-v2-mountain-back" />
        <div className="home-v2-mountain home-v2-mountain-front" />
        <div className="home-v2-citadel"><i/><i/><i/></div>
        <div className="home-v2-forge-beam" />

        <div className="home-v2-copy">
          <span className="k-mark">{field('hero-kicker')}</span>
          <h1>{field('hero-title', { as: 'span' })}</h1>
          <p>{field('hero-sub', { as: 'span', multiline: true })}</p>
          <div className="home-v2-actions">
            <Link href="/interest" className="home-v2-primary">Apply for a transfer</Link>
            <Link href="/tools" className="home-v2-secondary">View member tools →</Link>
          </div>
        </div>

        <RealmShieldLoader />

      </section>

      <section className="home-v2-strip">
        <div><span>01</span><b>TRANSFERS</b><p>Read the requirements and send us your player information.</p></div>
        <div><span>02</span><b>MEMBER FORMS</b><p>Update your profile and submit your KvK availability.</p></div>
        <div><span>03</span><b>CALCULATORS</b><p>Plan charm, pet, event shop, and other upgrades.</p></div>
      </section>

      <section className="home-v2-command">
        <div className="home-v2-command-copy">
          <span className="k-mark">{field('deck-head-kicker')}</span>
          <h2>{field('deck-head-title')}</h2>
          <p>{field('deck-head-sub', { multiline: true })}</p>
        </div>
        <div className="home-v2-command-list">
          {COMMAND.map((item) => (
            <Link key={item.href} href={item.href}><b>{item.n}</b><span><strong>{item.title}</strong><small>{item.sub}</small></span><i>↗</i></Link>
          ))}
        </div>
      </section>

      <section className="home-v2-story">
        <div className="home-v2-story-scene home-v2-story-gallery"><GalleryCarousel images={galleryImages} embedded /></div>
        <div className="home-v2-story-copy">
          <span className="k-mark">{field('why-head-kicker')}</span>
          <h2>{field('why-head-title')}</h2>
          <p>{field('why-head-sub', { multiline: true })}</p>
          <div className="home-v2-doctrine">
            {DOCTRINE.map((d) => <div key={d.n}><b>{d.n}</b><span><strong>{field(d.titleKey)}</strong><small>{field(d.bodyKey, { multiline: true })}</small></span></div>)}
          </div>
          <Link href="/about" className="home-v2-story-link">Read about Kingdom 710 →</Link>
        </div>
      </section>

      <section className="home-v2-alliances">
        <span className="k-mark">{field('wb-head-kicker')}</span>
        <h2>{field('wb-head-title')}</h2>
        <PublicBearAlliances initialAlliances={bearAlliances} notes={bearAllianceNotes(content)} />
      </section>

      <section className="home-v2-final">
        <div><span className="k-mark">KINGDOM TRANSFERS</span><h2>Interested in moving<br/>to Kingdom 710?</h2></div>
        <Link href="/interest">Open the transfer form</Link>
      </section>
    </main>
  );
}
