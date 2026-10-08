import './kvk-record.css';
import { timeAgo } from '../../lib/external/timelineProgress.mjs';

const RESULT_TEXT = { win: 'Won', loss: 'Lost' };

function Result({ value, label }) {
  if (!value) return null;
  return (
    <span className={`kvr-res kvr-res-${value}`}>
      <span aria-hidden="true">{value === 'win' ? '▲' : '▼'}</span> {label} {RESULT_TEXT[value]}
    </span>
  );
}

/**
 * Live "KvK record and rankings" block. Pass the object from getKvkRecord()
 * (lib/external/index.mjs). Server component, no client JS. The About-page
 * redesign can restyle kvk-record.css or reuse the data and markup freely.
 */
export default function KvkRecord({ data, now = Date.now(), headingId = 'kvk-record-heading' }) {
  if (!data) return null;
  const { record, ranking, matchups, atlas, sources, stale, isDefault, updatedAt } = data;
  const streak = record.streak ? `${record.streak.type === 'W' ? 'Win' : 'Loss'} streak: ${record.streak.count}` : null;
  return (
    <div className="kvr" aria-labelledby={headingId}>
      <h3 id={headingId} className="kvr-sr">Kingdom 710 KvK record and rankings</h3>
      <div className="kvr-top">
        <div className="kvr-big">
          <span className="kvr-label">KvK battle record</span>
          <strong className="kvr-record">
            <span className="kvr-w">{record.wins}</span>
            <span className="kvr-sep" aria-hidden="true">–</span>
            <span className="kvr-l">{record.losses}</span>
            <span className="kvr-sr"> wins to losses</span>
          </strong>
          <span className="kvr-sub">
            {record.kvks} KvKs · prep {record.prep.wins}–{record.prep.losses}{streak ? ` · ${streak}` : ''}
          </span>
        </div>
        <dl className="kvr-facts">
          <div>
            <dt>Optimizer rank</dt>
            <dd>#{ranking.rank}{ranking.of ? <small> of {ranking.of.toLocaleString('en-US')}</small> : null}</dd>
          </div>
          {ranking.rating !== null && (
            <div>
              <dt>Rating</dt>
              <dd>{Number(ranking.rating).toFixed(2)}</dd>
            </div>
          )}
          {atlas.rank !== null && (
            <div>
              <dt>Atlas rank{atlas.origin !== 'live' ? ' *' : ''}</dt>
              <dd>#{atlas.rank}{atlas.score !== null ? <small> score {atlas.score}</small> : null}</dd>
            </div>
          )}
        </dl>
      </div>

      {matchups.length > 0 && (
        <div className="kvr-matchups">
          <h4>Recent matchups</h4>
          <ol>
            {matchups.map((m) => (
              <li key={m.kvkNumber}>
                <span className="kvr-kvk">KvK {m.kvkNumber}</span>
                <span className="kvr-opp">vs K{m.opponent}</span>
                <span className="kvr-results">
                  <Result value={m.result} label="Battle" />
                  <Result value={m.prep} label="Prep" />
                </span>
                {m.date && <time dateTime={m.date}>{m.date}</time>}
              </li>
            ))}
          </ol>
        </div>
      )}

      {isDefault && (
        <p className="kvr-note" role="status">
          Live figures are unavailable right now. These are saved numbers from {data.defaultAsOf}; open the links below for the current record.
        </p>
      )}
      {!isDefault && stale && (
        <p className="kvr-note" role="status">The sources have not answered recently, so these figures may be out of date.</p>
      )}

      <p className="kvr-sources">
        Data from{' '}
        {sources.map((s, i) => (
          <span key={s.url}>
            {i > 0 ? ', ' : ''}
            <a href={s.url} target="_blank" rel="noopener noreferrer">{s.name}</a>
          </span>
        ))}
        {updatedAt ? <>. Updated {timeAgo(updatedAt, now)}.</> : '.'}
        {atlas.origin !== 'live' && (
          <> * Atlas does not publish its numbers in a form we may read automatically; {atlas.origin === 'manual' ? 'set by leadership' : 'saved figure'}{atlas.asOf ? ` (${String(atlas.asOf).slice(0, 10)})` : ''}.</>
        )}
      </p>
    </div>
  );
}
