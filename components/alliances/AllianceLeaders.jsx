'use client';

// Self-contained leadership display. The link to Discord exists only when an
// admin stored a valid Discord user id for that person; otherwise it is just
// the name (no placeholder). Drop this component anywhere an alliance's leaders are needed.
import { useT } from '../i18n/LanguageProvider';
import { leaderView } from '../../lib/allianceLeaders.mjs';
import './alliances.css';

function DiscordLink({ person }) {
  const t = useT();
  if (!person.href) return null;
  return (
    <a
      className="al-discord"
      href={person.href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={t('alliances.discord.aria', { name: person.name })}
    >
      {t('alliances.discord.short')}
    </a>
  );
}

/**
 * variant="list": every leader (role label above the name) for the alliance page.
 * variant="r5": only the R5 lines, compact, for the landing boxes.
 */
export default function AllianceLeaders({ leaders = [], variant = 'list', legacyContact = '' }) {
  const t = useT();
  const people = leaders.map(leaderView).filter((p) => variant === 'list' || p.role === 'R5');
  if (variant === 'r5') {
    if (!people.length) return null;
    return (
      <ul className="al-r5">
        {people.map((p) => (
          <li key={p.id}>
            <span className="al-person">
              <span className="al-role">{p.role}</span>
              <span className="al-name">{p.name}</span>
            </span>
            <DiscordLink person={p} />
          </li>
        ))}
      </ul>
    );
  }
  if (!people.length && !legacyContact) return <p className="al-muted">{t('alliances.leadership.none')}</p>;
  return (
    <ul className="al-people">
      {people.map((p) => (
        <li key={p.id}>
          <div className="al-person">
            <span className="al-role">{p.role}</span>
            <span className="al-name">{p.name}</span>
          </div>
          <DiscordLink person={p} />
        </li>
      ))}
      {legacyContact && (
        <li>
          <div className="al-person">
            <span className="al-role">{t('alliances.leadership.contact')}</span>
            <span className="al-name">{legacyContact}</span>
          </div>
        </li>
      )}
    </ul>
  );
}
