import Link from 'next/link';
import PageHero from '../../components/ui/PageHero';

export const metadata = {
  title: 'Help',
  description:
    'Plain-language help for Kingdom 710: how to join, how to sign in, what the words mean, and who to ask.',
  alternates: { canonical: '/help' },
};

const SECTIONS = [
  {
    id: 'what',
    title: 'What is Kingdom 710?',
    body: (
      <>
        <p>
          Kingdom 710 is a community of players in the mobile game Kingshot. We play together in three alliances
          and help each other win battles. This website is where we share events, guides and tools, and where new
          players can ask to join.
        </p>
      </>
    ),
  },
  {
    id: 'join',
    title: 'How do I join?',
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
    title: 'How do I sign in?',
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
    title: 'My code did not arrive',
    body: (
      <>
        <p>
          Check that Kingshot is open and that you typed the right Player ID. Wait one minute and try once more.
          If it still does not work, the page will offer a <strong>personal code</strong>. Ask your alliance leader
          for your personal code. It is 6 numbers.
        </p>
      </>
    ),
  },
  {
    id: 'words',
    title: 'What do these words mean?',
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
    title: 'Make the text bigger or change the language',
    body: (
      <>
        <p>
          At the top of every page there is a button called <strong>Easy view</strong>. It makes the text larger,
          the buttons bigger, and it turns off moving pictures. Press it again to go back.
        </p>
        <p>
          The button with letters such as <strong>EN</strong> changes the language of the website.
        </p>
      </>
    ),
  },
  {
    id: 'mistake',
    title: 'I made a mistake',
    body: (
      <>
        <p>
          Most forms can be sent again. Open the form, change your answers and press Send. Your newest answers are
          the ones we use. If you applied to join and need to change something, tell your alliance leader and give
          them your reference number.
        </p>
      </>
    ),
  },
  {
    id: 'ask',
    title: 'Who do I ask?',
    body: (
      <>
        <p>
          Ask your alliance leader in the game. If you are not in the kingdom yet, send an application and an
          officer will answer you there. You can also read <Link href="/about">About Kingdom 710</Link> to see who
          leads each alliance.
        </p>
      </>
    ),
  },
  {
    id: 'safe',
    title: 'Is my information safe?',
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

export default function HelpPage() {
  return (
    <main className="theme-realm help-page">
      <PageHero
        eyebrow="Kingdom 710"
        title="Help"
        lede="Short answers in plain words. If you cannot find what you need, ask your alliance leader."
      />
      <div className="help-inner">
        <nav className="help-toc" aria-label="Help topics">
          <h2>Jump to</h2>
          <ul>
            {SECTIONS.map((s) => (
              <li key={s.id}><a href={`#${s.id}`}>{s.title}</a></li>
            ))}
          </ul>
        </nav>
        {SECTIONS.map((s) => (
          <section key={s.id} id={s.id} className="help-section" aria-labelledby={`${s.id}-title`}>
            <h2 id={`${s.id}-title`}>{s.title}</h2>
            {s.body}
          </section>
        ))}
        <p className="help-back"><Link href="/">← Back to the home page</Link></p>
      </div>
    </main>
  );
}
