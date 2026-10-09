import { Fragment } from 'react';
import GearSlotButton from './GearSlotButton';
import CharmSlotButton from './CharmSlotButton';
import LoadoutPopover from './LoadoutPopover';
import { CrestMark } from './LoadoutIcons';
import { LOADOUT_PIECES } from '../../lib/loadout.mjs';

/**
 * The visual loadout: three pieces left, three right, K710 crest in the middle. A labelled group of buttons.
 * `open` = { piece, target } for the one slot whose popover is showing (or null). The popover is rendered right
 * after its slot in the DOM so Tab order stays sensible.
 */
export default function LoadoutBoard({ gear, charms, active, open, onActivate, onClose, onGearChange, onCharmChange }) {
  const popover = (piece, target, anchorId) => (open?.piece === piece.id && open?.target === target ? (
    <LoadoutPopover
      piece={piece}
      target={target}
      anchorId={anchorId}
      gear={gear}
      charms={charms}
      onGearChange={onGearChange}
      onCharmChange={onCharmChange}
      onClose={onClose}
    />
  ) : null);
  const column = (side) => LOADOUT_PIECES.filter((p) => p.side === side).map((piece) => (
    <div key={piece.id} className="lo-piece" data-piece={piece.id} data-tour={piece.id === LOADOUT_PIECES[0].id ? 'power-board' : undefined}>
      <GearSlotButton
        piece={piece}
        value={gear[piece.gearKey]}
        active={active?.piece === piece.id && active?.target === 'gear'}
        open={open?.piece === piece.id && open?.target === 'gear'}
        onActivate={onActivate}
      />
      {popover(piece, 'gear', `lo-tile-${piece.id}`)}
      <div className="lo-charms">
        {piece.charmKeys.map((key, i) => (
          <CharmSlotButton
            key={key}
            piece={piece}
            index={i}
            value={charms[key]}
            active={active?.piece === piece.id && active?.target === i}
            open={open?.piece === piece.id && open?.target === i}
            onActivate={onActivate}
          />
        ))}
      </div>
      {piece.charmKeys.map((key, i) => <Fragment key={key}>{popover(piece, i, `lo-gem-${piece.id}-${i}`)}</Fragment>)}
    </div>
  ));
  return (
    <div className="lo-board" role="group" aria-label="Governor gear and charms loadout. Select a slot to edit it.">
      <div className="lo-col lo-col-left">{column('left')}</div>
      <div className="lo-centre" aria-hidden="true">
        <CrestMark className="lo-crest" />
      </div>
      <div className="lo-col lo-col-right">{column('right')}</div>
    </div>
  );
}
