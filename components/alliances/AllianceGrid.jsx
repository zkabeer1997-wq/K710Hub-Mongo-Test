import AllianceCard from './AllianceCard';
import { orderAlliancesForLanding } from '../../lib/alliances.mjs';
import './alliances.css';

/**
 * Four equal boxes, two across (710, RED / SKY, PHL), one column on phones.
 * Any other active alliance simply continues the grid. Renders only what exists.
 */
export default function AllianceGrid({ alliances = [], compact = false }) {
  const list = orderAlliancesForLanding(alliances);
  return (
    <ul className="al-grid">
      {list.map((a) => <li key={a.tag}><AllianceCard alliance={a} compact={compact} /></li>)}
    </ul>
  );
}
