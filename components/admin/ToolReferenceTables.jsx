import { GOVERNOR_GEAR_LEVELS, CHARM_LEVELS } from '../../lib/phase2Data.mjs';

// Read-only reference tables (verified stat data for the Charms and Governor Gear planners).
// They are not editable from the admin panel; they are listed on Tool database for lookup only.
const RARITY_COLORS = { Green: '#3fbf6a', Blue: '#3f8fe0', Purple: '#a866e0', Gold: '#d9a94e', Red: '#e0554f' };
const fmt = (n) => Number(n).toLocaleString();
const pct = (n, digits = 2) => `${Number(n).toFixed(digits)}%`;

function parseGearTier(tierStr) {
  const [rarity, ...rest] = tierStr.split(' ');
  let remainder = rest.join(' ');
  let tGroup = '';
  const tMatch = remainder.match(/^T(\d+)/);
  if (tMatch) { tGroup = `T${tMatch[1]} `; remainder = remainder.slice(tMatch[0].length).trim(); }
  const romanMap = { I: 0, II: 1, III: 2, IV: 3 };
  let stars = 0;
  const plusMatch = remainder.match(/^\+(\d+)/);
  if (plusMatch) stars = Number(plusMatch[1]);
  else if (remainder && romanMap[remainder] !== undefined) stars = romanMap[remainder];
  return { rarity, tierLabel: `${tGroup}${stars}★` };
}

let cumulative = 0;
const GEAR_ROWS = GOVERNOR_GEAR_LEVELS.map((row) => {
  const { rarity, tierLabel } = parseGearTier(row.tier);
  cumulative += row.statGain;
  return { ...row, rarity, tierLabel, cumulative };
});
const CHARM_ROWS = CHARM_LEVELS.filter(Boolean);

export function CharmReferenceTable({ styles }) {
  return (
    <section className={styles.section}>
      <h2>Charm levels (read-only reference)</h2>
      <div className={`admin-table-wrap ${styles.refWrap}`}>
        <table className={`admin-table stack-table ${styles.table}`}>
          <thead><tr><th>Level</th><th>Guides</th><th>Designs</th><th>Health / Lethality</th><th>Power</th></tr></thead>
          <tbody>
            {CHARM_ROWS.map((row) => (
              <tr key={row.level}><td>Level {row.level}</td><td>{fmt(row.guides)}</td><td>{fmt(row.designs)}</td><td>{fmt(row.health)}</td><td>{fmt(row.power)}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function GearReferenceTable({ styles }) {
  return (
    <section className={styles.section}>
      <h2>Governor gear tiers (read-only reference)</h2>
      <div className={`admin-table-wrap ${styles.refWrap}`}>
        <table className={`admin-table stack-table ${styles.table}`}>
          <thead><tr><th>Rarity</th><th>Tier</th><th>Satin</th><th>Gilded Threads</th><th>Artisan&apos;s Vision</th><th>Stat Bonus</th><th>Cumulative</th><th>Set Bonus</th></tr></thead>
          <tbody>
            {GEAR_ROWS.map((row) => (
              <tr key={row.index}>
                <td><span className={styles.badge} style={{ '--badge-color': RARITY_COLORS[row.rarity] || '#8ea9b9' }}>{row.rarity}</span></td>
                <td>{row.tierLabel}</td><td>{fmt(row.satin)}</td><td>{fmt(row.threads)}</td>
                <td>{row.visions ? fmt(row.visions) : '–'}</td><td>+{pct(row.statGain)}</td><td>{pct(row.cumulative)}</td><td>+{pct(row.setBonus, 1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
