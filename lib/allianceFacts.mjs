// Public alliance facts. A fact with no value is omitted entirely rather than
// shown as "Not listed"; admins edit these fields in Admin > Alliances.
export function allianceFacts(alliance = {}) {
  const text = value => (typeof value === 'string' ? value.trim() : '');
  const roster = Number(alliance.roster_size);
  return [
    { key: 'timezone_focus', label: 'Timezone focus', value: text(alliance.timezone_focus) },
    { key: 'roster_size', label: 'Roster size', value: alliance.roster_size != null && alliance.roster_size !== '' && Number.isFinite(roster) && roster > 0 ? `${roster} members` : '' },
    { key: 'language', label: 'Primary language', value: text(alliance.language) },
    { key: 'leader_player_id', label: 'Leadership contact', value: text(alliance.leader_player_id) },
  ].filter(fact => fact.value);
}
