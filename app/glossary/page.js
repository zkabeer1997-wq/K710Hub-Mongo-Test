import Link from 'next/link';
import PageHero from '../../components/ui/PageHero';
import { GLOSSARY_GROUPS, GLOSSARY_TERMS } from '../../lib/glossary';

export const metadata = {
  title: 'Glossary',
  description:
    'Plain-language definitions of Kingshot and K710 Hub terms — Bear Hunt, KvK, Flamedragon Tyrant, Governor Gear, Power Profile, and more.',
  alternates: { canonical: '/glossary' },
};

export default function GlossaryPage() {
  return (
    <main className="theme-realm glossary-page">
      <PageHero
        eyebrow="Kingdom 710"
        title="Glossary"
        lede="New to Kingshot or just not sure what a term means? Here is what the words on this site stand for, in plain language."
      />

      <div className="glossary-inner">
        {GLOSSARY_GROUPS.map((group) => (
          <section key={group.heading} className="glossary-group" aria-labelledby={`g-${group.heading}`}>
            <h2 id={`g-${group.heading}`} className="glossary-group-title">
              {group.heading}
            </h2>
            <dl className="glossary-list">
              {group.terms.map((item) => (
                <div key={item.term} className="glossary-item">
                  <dt>{item.term}</dt>
                  <dd>{item.definition}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}

        <footer className="glossary-footer">
          <p>{GLOSSARY_TERMS.length} terms · Missing one? Ask on the transfer form and we will add it.</p>
          <nav>
            <Link href="/events">Events &amp; schedule →</Link>
            <Link href="/guides">Read the guides →</Link>
          </nav>
        </footer>
      </div>

      <style>{`
        .glossary-page{background:var(--color-bg);color:var(--color-ink);min-height:100vh;padding-bottom:112px}
        .glossary-inner{max-width:900px;margin:0 auto;padding:0 24px}
        .glossary-group{margin-top:clamp(40px,6vw,64px)}
        .glossary-group-title{margin:0 0 20px;font-family:var(--font-display);font-size:clamp(22px,3vw,30px);letter-spacing:-.02em;color:var(--color-link)}
        .glossary-list{margin:0;display:flex;flex-direction:column;gap:0}
        .glossary-item{padding:20px 0;border-top:1px solid var(--color-border);display:grid;grid-template-columns:minmax(0,280px) minmax(0,1fr);gap:24px;align-items:start}
        .glossary-item dt{margin:0;font-family:var(--font-display);font-size:19px;letter-spacing:-.01em;color:var(--color-ink)}
        .glossary-item dd{margin:0;color:var(--color-ink-muted);font-size:15px;line-height:1.7}
        .glossary-footer{margin-top:clamp(48px,7vw,72px);padding-top:28px;border-top:1px solid var(--color-border);display:flex;flex-wrap:wrap;gap:20px;justify-content:space-between;align-items:center}
        .glossary-footer p{margin:0;color:var(--color-ink-muted);font-size:14px;max-width:52ch}
        .glossary-footer nav{display:flex;gap:20px;flex-wrap:wrap}
        .glossary-footer a{color:var(--color-link);font-weight:700;font-size:14px;text-decoration:none}
        .glossary-footer a:hover{text-decoration:underline}
        @media(max-width:640px){
          .glossary-item{grid-template-columns:1fr;gap:6px}
          .glossary-item dt{font-size:18px}
        }
      `}</style>
    </main>
  );
}
