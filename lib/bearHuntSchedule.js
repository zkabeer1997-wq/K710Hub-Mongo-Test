// Schedule values live on alliances.bear_times_utc. These helpers are safe
// to share between server endpoints and public client components.
export function validateBearTimes(value) {
  if (!Array.isArray(value) || value.length > 24) return { error: 'Add up to 24 Bear Hunt times per alliance.' };
  if (value.some(time => typeof time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time))) {
    return { error: 'Each Bear Hunt time must be a valid UTC time in HH:MM format.' };
  }
  if (new Set(value).size !== value.length) return { error: 'Remove duplicate Bear Hunt times for this alliance.' };
  return { times: [...value].sort() };
}

export function huntsFromAlliances(alliances = []) {
  return alliances.filter(alliance => alliance.active !== false).flatMap(alliance => {
    const { times } = validateBearTimes(alliance.bear_times_utc || []);
    return (times || []).map(utc => ({ band: alliance.tag, utc }));
  }).sort((a, b) => a.utc.localeCompare(b.utc) || a.band.localeCompare(b.band));
}

export function toMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

export function pad(n) { return String(n).padStart(2, '0'); }

export function nextHunt(nowMin, hunts = []) {
  if (!hunts.length) return null;
  const sorted = [...hunts].sort((a, b) => toMinutes(a.utc) - toMinutes(b.utc));
  const upcoming = sorted.find(hunt => toMinutes(hunt.utc) > nowMin);
  const target = upcoming || sorted[0];
  return { ...target, inMin: upcoming ? toMinutes(target.utc) - nowMin : 1440 - nowMin + toMinutes(target.utc) };
}

// The next Bear Hunt time (an "HH:MM" UTC string from `times`) at or after
// `now` (ms epoch), wrapping to tomorrow's first time. A hunt that starts in
// the current minute counts as next so it is highlighted while it begins.
export function nextBearTime(times = [], now = Date.now()) {
  const { times: valid } = validateBearTimes(Array.isArray(times) ? times : []);
  if (!valid || !valid.length) return null;
  const date = new Date(now);
  const nowMin = date.getUTCHours() * 60 + date.getUTCMinutes();
  return valid.find(time => toMinutes(time) >= nowMin) || valid[0];
}
