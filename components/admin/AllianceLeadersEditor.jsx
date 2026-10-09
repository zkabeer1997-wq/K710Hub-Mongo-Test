'use client';

import { Button, Field, Input, Select } from '../ui';
import { LEADER_ROLES, MAX_LEADERS, MAX_NAME_LENGTH, MAX_ROLE_LENGTH, normalizeDiscordId } from '../../lib/allianceLeaders.mjs';

const OTHER = '__other';
const newId = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `l${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`);

export function blankLeader(role = 'R5') {
  return { id: newId(), role, name: '', player_id: '', discord_id: '' };
}

// Repeatable row editor for an alliance's leaders (R5, R4, Transfer Manager, other roles).
export default function AllianceLeadersEditor({ leaders, disabled, onChange }) {
  const update = (index, patch) => onChange(leaders.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  return (
    <fieldset disabled={disabled} style={{ border: '1px solid var(--edge)', padding: 16, display: 'grid', gap: 12, minWidth: 0 }}>
      <legend>Leaders</legend>
      <p style={{ margin: 0 }}>Shown on the alliance page and the alliances overview. A &quot;Message on Discord&quot; link appears only for people who have a Discord ID here.</p>
      <details>
        <summary>How to find a Discord ID</summary>
        <p style={{ margin: '8px 0 0' }}>In Discord open Settings, then Advanced, and turn on Developer Mode. Then right-click the person and choose Copy User ID. Paste the number here. A link like https://discord.com/users/123456789012345678 also works.</p>
      </details>
      {leaders.map((leader, index) => {
        const isCustom = !LEADER_ROLES.includes(leader.role);
        const idError = leader.discord_id && normalizeDiscordId(leader.discord_id) === null;
        const n = index + 1;
        return (
          <div key={leader.id} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(180px, 100%), 1fr))', gap: 12, alignItems: 'end', paddingTop: 12, borderTop: index ? '1px solid var(--edge)' : 0 }}>
            <Field label={`Leader ${n} role`} htmlFor={`leader-role-${leader.id}`}>
              <Select id={`leader-role-${leader.id}`} tone="console" value={isCustom ? OTHER : leader.role} onChange={(e) => update(index, { role: e.target.value === OTHER ? ' ' : e.target.value })}>
                {LEADER_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                <option value={OTHER}>Other role…</option>
              </Select>
            </Field>
            {isCustom && (
              <Field label={`Leader ${n} role name`} htmlFor={`leader-custom-${leader.id}`}>
                <Input id={`leader-custom-${leader.id}`} tone="console" maxLength={MAX_ROLE_LENGTH} value={leader.role.trim() === '' ? '' : leader.role} onChange={(e) => update(index, { role: e.target.value || ' ' })} />
              </Field>
            )}
            <Field label={`Leader ${n} name`} htmlFor={`leader-name-${leader.id}`}>
              <Input id={`leader-name-${leader.id}`} tone="console" maxLength={MAX_NAME_LENGTH} value={leader.name} onChange={(e) => update(index, { name: e.target.value })} />
            </Field>
            <Field label="Player ID (optional)" htmlFor={`leader-pid-${leader.id}`}>
              <Input id={`leader-pid-${leader.id}`} tone="console" inputMode="numeric" value={leader.player_id || ''} onChange={(e) => update(index, { player_id: e.target.value })} />
            </Field>
            <Field label="Discord ID (optional)" htmlFor={`leader-discord-${leader.id}`} error={idError ? 'Use the 17 to 20 digit ID, or a https://discord.com/users/… link.' : undefined}>
              <Input id={`leader-discord-${leader.id}`} tone="console" inputMode="numeric" value={leader.discord_id || ''} onChange={(e) => update(index, { discord_id: e.target.value })} onBlur={() => { const id = normalizeDiscordId(leader.discord_id); if (id) update(index, { discord_id: id }); }} />
            </Field>
            <Button variant="quiet" aria-label={`Remove leader ${n}`} onClick={() => onChange(leaders.filter((_, i) => i !== index))}>Remove</Button>
          </div>
        );
      })}
      {leaders.length === 0 && <p style={{ margin: 0 }}>No leaders listed. Add the R5 and anyone players should be able to contact.</p>}
      <Button variant="quiet" disabled={leaders.length >= MAX_LEADERS} onClick={() => onChange([...leaders, blankLeader(leaders.some((l) => l.role === 'R5') ? 'R4' : 'R5')])}>+ Add leader</Button>
    </fieldset>
  );
}
