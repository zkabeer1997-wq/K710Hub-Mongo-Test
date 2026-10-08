import GearSlotButton from './GearSlotButton';
import CharmSlotButton from './CharmSlotButton';
import { CrestMark } from './LoadoutIcons';
import { LOADOUT_PIECES } from '../../lib/loadout.mjs';

/** The visual loadout: three pieces left, three right, K710 crest in the middle. A labelled group of buttons. */
export default function LoadoutBoard({ gear, charms, active, onActivate }) {
  const column = (side) => LOADOUT_PIECES.filter((p) => p.side === side).map((piece) => (
    <div key={piece.id} className="lo-piece" data-piece={piece.id}>
      <GearSlotButton
        piece={piece}
        value={gear[piece.gearKey]}
        active={active?.piece === piece.id && active?.target === 'gear'}
        onActivate={onActivate}
      />
      <div className="lo-charms">
        {piece.charmKeys.map((key, i) => (
          <CharmSlotButton
            key={key}
            piece={piece}
            index={i}
            value={charms[key]}
            active={active?.piece === piece.id && active?.target === i}
            onActivate={onActivate}
          />
        ))}
      </div>
    </div>
  ));
  return (
    <div className="lo-board" role="group" aria-label="Governor gear and charms loadout. Select a slot to edit it in the table below.">
      <div className="lo-col lo-col-left">{column('left')}</div>
      <div className="lo-centre" aria-hidden="true">
        <CrestMark className="lo-crest" />
      </div>
      <div className="lo-col lo-col-right">{column('right')}</div>
    </div>
  );
}
