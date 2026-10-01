'use client';

import { useEffect, useState } from 'react';
import { huntsFromAlliances, toMinutes } from '../lib/bearHuntSchedule';
import { bearTimeLabel } from '../lib/localTime';

function formatIn(totalMin) {
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function compute(alliances, tag, now) {
  const scoped = tag ? alliances.filter((a) => a.tag === tag) : alliances;
  const hunts = huntsFromAlliances(scoped);
  if (!hunts.length) return null;
  const nowSec = now.getUTCHours() * 3600 + now.getUTCMinutes() * 60 + now.getUTCSeconds();
  let best = null;
  for (const hunt of hunts) {
    let delta = toMinutes(hunt.utc) * 60 - nowSec;
    if (delta <= 0) delta += 86400;
    if (!best || delta < best.delta) best = { ...hunt, delta };
  }
  return { ...best, inMin: Math.floor(best.delta / 60) };
}

/**
 * "Next Bear Hunt in Xh Ym" for the member's alliance. When the alliance is
 * unknown it counts down to the next hunt across all alliances and says so.
 * Renders no time on the server so the first client render matches.
 */
export default function NextBearHunt({ alliances = [], allianceTag = null }) {
  const [now, setNow] = useState(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 15000);
    return () => clearInterval(id);
  }, []);

  const list = Array.isArray(alliances) ? alliances : [];
  const hunt = now && list.length ? compute(list, allianceTag, now) : null;
  const scope = allianceTag ? `${allianceTag} alliance` : 'any alliance';

  if (!list.length) {
    return <p className="home-hunt-empty">Bear Hunt times are unavailable right now.</p>;
  }
  return (
    <div className="home-hunt" aria-live="polite">
      <span className="home-hunt-label">Next Bear Hunt in</span>
      <strong className="home-hunt-time">{hunt ? formatIn(hunt.inMin) : '—'}</strong>
      <span className="home-hunt-meta">
        {hunt ? `${hunt.band} · ${bearTimeLabel(hunt.utc, { mounted: true })}` : 'Calculating…'}
      </span>
      {!allianceTag && (
        <span className="home-hunt-note">Your alliance is not on file, so this is the next hunt across all alliances.</span>
      )}
      {allianceTag && <span className="home-hunt-note">Showing the {scope} schedule.</span>}
    </div>
  );
}
