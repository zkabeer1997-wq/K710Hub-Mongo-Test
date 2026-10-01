import Link from 'next/link';
import FusionMotion from './FusionMotion';
import './fusion.css';

export const metadata = {
  title: { absolute: 'K710 Homepage Fusion Concept' },
  description: 'Combined War Room, Living Kingdom, and Forge Gate homepage concept.',
  robots: { index: false, follow: false },
};

export default function HomepageFusion() {
  return (
    <main className="fusion-page">
      <FusionMotion />
      <section className="fusion-hero">
        <div className="sky-glow" />
        <div className="mountain mountain-a" />
        <div className="mountain mountain-b" />
        <div className="forge-beam" />
        <div className="citadel-shape"><i/><i/><i/></div>

        <div className="fusion-copy">
          <span className="eyebrow">KINGDOM 710 · THE FORGE IS OPEN</span>
          <h1>Enter the kingdom.<br/><em>Join the machine.</em></h1>
          <p>World-building at the threshold, forge identity at the center, and a live command layer built directly into the homepage.</p>
          <div className="hero-actions">
            <Link href="/interest" className="cta-primary">Request entry</Link>
            <Link href="/tools" className="cta-secondary">Member command →</Link>
          </div>
        </div>

        <div className="shield-core"><span>710</span><b>FORGED</b></div>

        <aside className="command-rail">
          <div className="rail-head"><span>KINGDOM SIGNAL</span><b>● LIVE</b></div>
          <article><small>STATUS</small><strong>KVK MODE</strong><p>Preparation, growth and coordination in motion.</p></article>
          <article><small>ALLIANCES</small><strong>03 ACTIVE</strong><p>710 · RED · SKY</p></article>
          <article><small>MEMBER ACCESS</small><strong>TOOLS LIVE</strong><p>Forms, power data, events and optimizers.</p></article>
        </aside>
      </section>

      <section className="kingdom-strip">
        <div><span>01</span><b>THE REALM</b><p>History, culture and what makes 710 worth joining.</p></div>
        <div><span>02</span><b>THE WAR ROOM</b><p>Live operational routes without turning the homepage into a dashboard.</p></div>
        <div><span>03</span><b>THE FORGE</b><p>The existing shield/forge identity continues after the loader instead of disappearing.</p></div>
      </section>

      <section className="command-section">
        <div className="command-intro">
          <span>MEMBER COMMAND</span>
          <h2>Know the next move.</h2>
          <p>The cinematic identity resolves into a compact operational deck rather than a grid of generic feature cards.</p>
        </div>
        <div className="command-list">
          <Link href="/events"><b>01</b><span><strong>Events</strong><small>Campaign schedule and kingdom timing</small></span><i>↗</i></Link>
          <Link href="/guides"><b>02</b><span><strong>Guides</strong><small>Doctrine, strategy and kingdom knowledge</small></span><i>↗</i></Link>
          <Link href="/tools"><b>03</b><span><strong>Tools</strong><small>Optimizers, calculators and event utilities</small></span><i>↗</i></Link>
          <Link href="/power-profile"><b>04</b><span><strong>Power Profile</strong><small>Player strength and profile management</small></span><i>↗</i></Link>
        </div>
      </section>

      <section className="story-section">
        <div className="story-landscape"><div className="story-sun"/><div className="story-castle"/></div>
        <div className="story-copy"><span>WHY 710</span><h2>A kingdom should feel like a place, not a portal.</h2><p>This section borrows from the Living Kingdom concept: history, alliances and recruitment become world-building rather than stacked informational cards.</p><Link href="/about">Read the kingdom story →</Link></div>
      </section>

      <section className="alliance-section">
        <span className="section-kicker">THREE BANNERS · ONE OPERATING PICTURE</span>
        <div className="alliance-line"><div><b>710</b><small>KINGDOM CORE</small></div><i/><div><b>RED</b><small>REDEMPTION</small></div><i/><div><b>SKY</b><small>ALLIANCE WING</small></div></div>
      </section>

      <section className="final-cta">
        <div><span>THE GATE IS OPEN</span><h2>Come in as a player.<br/>Stay because it works.</h2></div>
        <Link href="/interest">Start transfer path</Link>
      </section>
    </main>
  );
}
