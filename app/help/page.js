import Link from 'next/link';
import PageHero from '../../components/ui/PageHero';
import { HELP_SECTIONS, chunkRows } from '../../lib/helpSections.mjs';
import { planHelpSections } from '../../lib/helpImages.mjs';
import { getHelpImageMap } from '../../lib/helpImages.server';
import './help.css';

// Pictures are read per request (cached ~30 s in memory, fail open to text only).
export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Help',
  description:
    'Plain-language help for Kingdom 710: how to join, how to sign in, what the words mean, and who to ask.',
  alternates: { canonical: '/help' },
};

const BODIES = [
  {
    id: 'what',
    body: (
      <>
        <p>
          Kingdom 710 is a community of players in the mobile game Kingshot. We play together in several alliances
          and help each other win battles. This website is where we share events, guides and tools, and where new
          players can ask to join.
        </p>
      </>
    ),
  },
  {
    id: 'join',
    body: (
      <>
        <ol>
          <li>Press <Link href="/interest">Apply to join Kingdom 710</Link>.</li>
          <li>Answer the questions one step at a time. You can use the Back button at any time.</li>
          <li>Your answers are saved on this device, so you can close the page and come back later.</li>
          <li>When you finish, you get a reference number. Keep it.</li>
          <li>Come back to <Link href="/interest/status">Check my application</Link> and type that number to see the answer.</li>
        </ol>
      </>
    ),
  },
  {
    id: 'signin',
    body: (
      <>
        <ol>
          <li>Go to <Link href="/login">Sign in</Link>.</li>
          <li>
            Type your <strong>Player ID</strong>. In Kingshot, tap your picture in the top-left corner. Your Player
            ID is the number shown there.
          </li>
          <li>Open Kingshot on your phone, then press the button on our page. We send a short code to the game.</li>
          <li>Look in the game for the message with the code. Type the code on our page.</li>
        </ol>
        <p>Once you are in, you stay signed in for 30 days on that device.</p>
      </>
    ),
  },
  {
    id: 'nocode',
    body: (
      <>
        <p>
          Check that Kingshot is open and that you typed the right Player ID. Wait one minute and try once more.
          If it still does not work, the page will offer a <strong>personal code</strong>. Message an R5 on Discord
          for your personal code. The <Link href="/alliances">Alliances</Link> page lists each alliance&apos;s R5s. It is 6 numbers.
        </p>
      </>
    ),
  },
  {
    id: 'words',
    body: (
      <>
        <p>
          <strong>KvK</strong> is the big kingdom-versus-kingdom battle event. <strong>Bear Hunt</strong> is a team
          event where alliances fight a bear. <strong>TG</strong> (TrueGold) is a high upgrade tier, from TG1 up to TG10. Higher is stronger. <strong>Power</strong> is
          the number that shows how strong your account is.
        </p>
        <p>
          The full list is on the <Link href="/glossary">Glossary page</Link>. On other pages, words with a dotted
          line under them explain themselves when you tap them.
        </p>
      </>
    ),
  },
  {
    id: 'settings',
    body: (
      <>
        <p>
          At the top of every page there is a button called <strong>Bigger text</strong> (marked <strong>Aa</strong>). It makes the text larger,
          the buttons bigger, and it turns off moving pictures. Press it again to go back.
        </p>
        <p>
          The language button (it shows the language name, or letters such as <strong>EN</strong> on a phone) changes the language of the website.
        </p>
      </>
    ),
  },
  {
    id: 'mistake',
    body: (
      <>
        <p>
          Most forms can be sent again. Open the form, change your answers and press Send. Your newest answers are
          the ones we use. If you applied to join and need to change something, message an R5 on Discord and give
          them your reference number.
        </p>
      </>
    ),
  },
  {
    id: 'ask',
    body: (
      <>
        <p>
          Message an R5 on Discord. The <Link href="/alliances">Alliances</Link> page lists the R5s of each alliance,
          with a Discord link where they have shared one. If you are not in the kingdom yet, send an application and an
          officer will answer you there.
        </p>
      </>
    ),
  },
  {
    id: 'safe',
    body: (
      <>
        <p>
          We only ask for what we need to run the kingdom, such as your Player ID and your game name. The sign-in
          code goes to your game and we do not keep it. We never ask for your game password.
        </p>
      </>
    ),
  },
];
const BODY_BY_ID = Object.fromEntries(BODIES.map((b) => [b.id, b.body]));

export default async function HelpPage() {
  const images = await getHelpImageMap();
  const sections = planHelpSections(HELP_SECTIONS, images);
  const rows = chunkRows(sections, 3);
  let number = 0;
  return (
    <main className="theme-realm help-page">
      <PageHero
        eyebrow="Kingdom 710"
        title="Help"
        lede="Short answers in plain words. If you cannot find what you need, message an R5 on Discord."
      />
      <div className="help-inner">
        <nav className="help-toc" aria-label="Help topics">
          <h2>Jump to</h2>
          <ul className="help-toc-grid">
            {rows.flatMap((row) => row.map((s) => {
              number += 1;
              return (
                <li key={s.id}>
                  <a href={`#${s.id}`}><span className="help-toc-num" aria-hidden="true">{number}</span><span>{s.title}</span></a>
                </li>
              );
            }))}
          </ul>
        </nav>
        {sections.map((s) => (
          <section key={s.id} id={s.id} className={`help-section${s.image ? ` has-image image-${s.image.side}` : ''}`} aria-labelledby={`${s.id}-title`}>
            <h2 id={`${s.id}-title`}>{s.title}</h2>
            <div className="help-text">{BODY_BY_ID[s.id]}</div>
            {s.image ? (
              <figure className="help-figure">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={s.image.url} alt={s.image.alt} loading="lazy" decoding="async" {...(s.image.width && s.image.height ? { width: s.image.width, height: s.image.height } : { width: 640, height: 480 })} />
                {s.image.caption ? <figcaption>{s.image.caption}</figcaption> : null}
              </figure>
            ) : null}
          </section>
        ))}
        <p className="help-back"><Link href="/">← Back to the home page</Link></p>
      </div>
    </main>
  );
}
