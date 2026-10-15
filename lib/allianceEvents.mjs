export const ALLIANCE_EVENT_TYPES = {
  regular_swordland_1: 'Regular Swordland Legion 1',
  regular_swordland_2: 'Regular Swordland Legion 2',
  swordland_summit_1: 'Swordland Summit Legion 1',
  swordland_summit_2: 'Swordland Summit Legion 2',
  tri_alliance_1: 'Tri-Alliance Legion 1',
  tri_alliance_2: 'Tri-Alliance Legion 2',
  vikings_vengeance: 'Vikings Vengeance',
};
export const MAX_ALLIANCE_EVENTS = 100;

export function validateAllianceEvents(value) {
  if (!Array.isArray(value) || value.length > MAX_ALLIANCE_EVENTS) {
    return { error: `Add up to ${MAX_ALLIANCE_EVENTS} alliance event dates.` };
  }
  const events = [];
  const seen = new Set();
  for (const [index, event] of value.entries()) {
    const fail = message => ({ error: `Event ${index + 1}: ${message}` });
    if (!event || !Object.hasOwn(ALLIANCE_EVENT_TYPES, event.type)) return fail('choose a supported event type.');
    if (typeof event.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(event.date) || event.date < '2000-01-01') return fail('enter a valid date.');
    const date = new Date(`${event.date}T00:00:00.000Z`);
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== event.date) return fail('enter a valid date.');
    if (typeof event.time_utc !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(event.time_utc)) return fail('enter a UTC time between 00:00 and 23:59.');
    const key = `${event.type}/${event.date}/${event.time_utc}`;
    if (seen.has(key)) return fail('this event already has the same date and time.');
    seen.add(key);
    events.push({ type: event.type, date: event.date, time_utc: event.time_utc });
  }
  return { events: events.sort((a, b) => `${a.date} ${a.time_utc}`.localeCompare(`${b.date} ${b.time_utc}`)) };
}

export function allianceEventEntries(alliances) {
  // `alliance_rank` is the alliance's place in the saved website order (the input order), for filters and ties.
  return alliances.filter(alliance => alliance.active !== false).flatMap((alliance, rank) => {
    const { events = [] } = validateAllianceEvents(alliance.scheduled_events || []);
    return events.map(event => ({
      ...event,
      alliance_tag: alliance.tag,
      alliance_name: alliance.name,
      alliance_rank: rank,
      title: ALLIANCE_EVENT_TYPES[event.type],
      starts_at: `${event.date}T${event.time_utc}:00.000Z`,
    }));
  }).sort((a, b) => a.starts_at.localeCompare(b.starts_at) || a.alliance_rank - b.alliance_rank || a.alliance_tag.localeCompare(b.alliance_tag));
}

// Keep today's started events visible without guessing how long they run.
export function currentAllianceEvents(events, now) {
  const today = new Date(now).toISOString().slice(0, 10);
  return events.filter(event => event.date >= today);
}
