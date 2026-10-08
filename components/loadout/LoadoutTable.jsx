import { CharmLevelSelect, QualitySelect, StarsSelect, TierSelect } from './LoadoutFields';
import { LOADOUT_PIECES } from '../../lib/loadout.mjs';

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
            const rowActive = active?.piece === piece.id;
            const change = (v) => onGearChange(piece, v);
            return (
              <tr key={piece.id} data-active={rowActive ? 'true' : undefined}>
                <th scope="row" data-label="Slot">{piece.name}</th>
                <td data-label="Troop">{piece.troopName}</td>
                <td data-label="Quality"><QualitySelect id={`lo-gear-${piece.id}`} label={`${piece.name} quality`} piece={piece} value={value} onChange={change} /></td>
                <td data-label="Tier"><TierSelect label={`${piece.name} tier`} piece={piece} value={value} onChange={change} /></td>
                <td data-label="Stars"><StarsSelect label={`${piece.name} stars`} piece={piece} value={value} onChange={change} /></td>
                {piece.charmKeys.map((key, i) => (
                  <td key={key} data-label={`Charm ${i + 1}`}>
                    <CharmLevelSelect
                      id={`lo-charm-${piece.id}-${i}`}
                      label={`${piece.name} charm ${i + 1} level`}
                      value={charms[key]}
                      onChange={(v) => onCharmChange(piece, i, key, v)}
                    />
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
