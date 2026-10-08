import { CHARM_LEVEL_OPTIONS } from '../../lib/equipmentOptions.mjs';
import { QUALITIES } from '../../lib/scan/kinds/governorProfile/gameData.mjs';
import {
  LOADOUT_PIECES,
  editGearValue,
  parseGearValue,
  starsFor,
  starsLabel,
  tierLabel,
  tiersFor,
} from '../../lib/loadout.mjs';

/** The written values, editable. One row per gear piece plus its three charms. Same state as the board. */
export default function LoadoutTable({ gear, charms, active, onGearChange, onCharmChange }) {
  return (
    <div className="lo-table-wrap">
      <table className="lo-table">
        <caption className="lo-sr-only">Governor gear and charm levels, one row per gear piece</caption>
        <thead>
          <tr>
            <th scope="col">Slot</th>
            <th scope="col">Troop</th>
            <th scope="col">Quality</th>
            <th scope="col">Tier</th>
            <th scope="col">Stars</th>
            <th scope="col">Charm 1</th>
            <th scope="col">Charm 2</th>
            <th scope="col">Charm 3</th>
          </tr>
        </thead>
        <tbody>
          {LOADOUT_PIECES.map((piece) => {
            const value = gear[piece.gearKey] || '';
            const parsed = parseGearValue(value);
            const unknown = Boolean(value.trim()) && !parsed;
            const rowActive = active?.piece === piece.id;
            const who = piece.name.toLowerCase();
            return (
              <tr key={piece.id} data-active={rowActive ? 'true' : undefined}>
                <th scope="row" data-label="Slot">{piece.name}</th>
                <td data-label="Troop">{piece.troopName}</td>
                <td data-label="Quality">
                  <select
                    id={`lo-gear-${piece.id}`}
                    aria-label={`${piece.name} quality`}
                    value={unknown ? '__saved' : parsed?.quality || ''}
                    onChange={(e) => onGearChange(piece, editGearValue(value, 'quality', e.target.value))}
                  >
                    <option value="">No gear</option>
                    {unknown ? <option value="__saved" disabled>{`Saved: ${value}`}</option> : null}
                    {QUALITIES.map((q) => <option key={q.id} value={q.id}>{q.name}</option>)}
                  </select>
                </td>
                <td data-label="Tier">
                  <select
                    aria-label={`${piece.name} tier`}
                    value={parsed ? String(parsed.tier) : ''}
                    disabled={!parsed}
                    onChange={(e) => onGearChange(piece, editGearValue(value, 'tier', e.target.value))}
                  >
                    {!parsed ? <option value="">-</option> : null}
                    {parsed ? tiersFor(parsed.quality).map((t) => <option key={t} value={t}>{tierLabel(t)}</option>) : null}
                  </select>
                </td>
                <td data-label="Stars">
                  <select
                    aria-label={`${piece.name} stars`}
                    value={parsed ? String(parsed.stars) : ''}
                    disabled={!parsed}
                    onChange={(e) => onGearChange(piece, editGearValue(value, 'stars', e.target.value))}
                  >
                    {!parsed ? <option value="">-</option> : null}
                    {parsed ? starsFor(parsed.quality, parsed.tier).map((s) => <option key={s} value={s}>{starsLabel(s)}</option>) : null}
                  </select>
                </td>
                {piece.charmKeys.map((key, i) => (
                  <td key={key} data-label={`Charm ${i + 1}`}>
                    <select
                      id={`lo-charm-${piece.id}-${i}`}
                      aria-label={`${piece.name} charm ${i + 1} level`}
                      value={charms[key] || ''}
                      onChange={(e) => onCharmChange(piece, i, key, e.target.value)}
                    >
                      <option value="">Not set</option>
                      {CHARM_LEVEL_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
