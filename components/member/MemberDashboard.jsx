'use client';

import Link from 'next/link';
import { Term, PageHero } from '../ui';
import GiftCodeRewards from '../GiftCodeRewards';
import { useMemberFormStatus } from '../../lib/useMemberFormStatus';
import { dashboardLinks } from '../../lib/memberForms.mjs';
import MyFormsList from './MyFormsList';
import DeadlinesPanel from './DeadlinesPanel';
import styles from './MemberDashboard.module.css';

function formatNumber(value) {
  return value == null || value === '' ? '—' : new Intl.NumberFormat().format(value);
}

function Avatar({ profile }) {
  const initial = (profile?.nickname || 'K').trim().charAt(0).toUpperCase();
  return (
    <span className={styles.avatar}>
      {profile?.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={profile.avatarUrl} alt={`${profile.nickname} profile`} />
      ) : (
        <span aria-hidden="true">{initial}</span>
      )}
    </span>
  );
}

// Signed-in dashboard: account card, My forms (3/4) beside Deadlines (1/4), then a few links.
// The Admin link depends on the live role the session returns, never on client state.
export default function MemberDashboard({ profile, adminAccessRequested, busy, onLogout }) {
  const { status, loaded } = useMemberFormStatus();
  const displayName = (profile.nickname || '').trim() || 'Governor';
  const role = String(profile.role || 'member');
  const links = dashboardLinks(role);
  return (
    <div className={styles.dash}>
      <header className={styles.head}>
        <PageHero
          tone="console"
          className={styles.hero}
          eyebrow="Secure player access · Kingdom 710"
          title="Dashboard"
          lede={`Welcome back, ${displayName}. Your account is connected. Choose where to go next.`}
        />
        <div className={styles.assurance}>
          <strong>Signed in with Kingshot</strong>
          <span>Session stays active for 30 days unless you log out.</span>
        </div>
      </header>

      <section className={styles.account} aria-label="Your account">
        <div className={styles.accountTop}>
          <span><i aria-hidden="true" /> Account connected</span>
          <span className={styles.role} data-role={role}>{role}</span>
        </div>
        <div className={styles.accountBody}>
          <div className={styles.who}>
            <Avatar profile={profile} />
            <div>
              <h2>{profile.nickname}</h2>
              <p>#{profile.playerId} · Kingdom {profile.kingdomId}</p>
              <span>{profile.allianceAbbr ? `[${profile.allianceAbbr}] ${profile.allianceName}` : 'No alliance listed'}</span>
            </div>
          </div>
          <div className={styles.stats} aria-label="Player statistics">
            <div><span>Power</span><strong>{formatNumber(profile.power)}</strong></div>
            <div><span><Term term="Mystic Trial">Mystic Trial</Term></span><strong>{formatNumber(profile.mysticTrial)}</strong></div>
          </div>
        </div>
        {adminAccessRequested && role !== 'admin' && role !== 'superadmin' && (
          <div className={styles.notice} role="status">Your member account does not have administrator access.</div>
        )}
      </section>

      <div className={styles.split}>
        <MyFormsList status={status} loaded={loaded} />
        <div className={styles.side}><DeadlinesPanel status={status} loaded={loaded} /></div>
      </div>

      <nav className={styles.links} aria-label="Member destinations">
        {links.map((link) => (
          <Link key={link.key} href={link.href}><span>{link.label}</span><b aria-hidden="true">→</b></Link>
        ))}
      </nav>

      <section className={styles.gifts} aria-labelledby="dashboard-gift-codes-title">
        <h2 id="dashboard-gift-codes-title">Gift codes</h2>
        <GiftCodeRewards />
      </section>

      <button className={styles.logout} type="button" onClick={onLogout} disabled={busy}>
        {busy ? 'Logging out…' : 'Log out'}
      </button>
    </div>
  );
}
