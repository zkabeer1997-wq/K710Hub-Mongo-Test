'use client';

import { useState, useEffect } from 'react';
import { KVK_ALLIANCES, KVK_AVAILABILITY_OPTIONS } from '../../lib/playerCombatOptions.mjs';
import { useFormFieldMeta } from '../../lib/useFormFieldMeta';
import { refreshMemberFormStatus } from '../../lib/useMemberFormStatus';
import { TROOP_FIELD_KEYS } from '../../lib/kvkAvailability.mjs';
import UpsertNotice from '../../components/member/UpsertNotice';
import { HeroRosterPicker, TroopLevelFields } from '../../components/member/TroopHeroFields';
import IdentityFields from '../../components/member/IdentityFields';

const AVAILABILITY_OPTIONS = KVK_AVAILABILITY_OPTIONS;
const ALLIANCES = KVK_ALLIANCES;

export default function PlayerRecordForm({ identity, heroCatalog }) {
  const { intro } = useFormFieldMeta('joiner');
  // Identity arrives from the server as props: the form opens with name and (locked) Member ID filled.
  const memberId = identity?.memberId || '';
  const [name, setName] = useState(identity?.name || '');
  const [availability, setAvailability] = useState('');
  const [currentAlliance, setCurrentAlliance] = useState(identity?.alliance || '');
  const [troops, setTroops] = useState(() => Object.fromEntries(TROOP_FIELD_KEYS.map((key) => [key, ''])));
  const [heroes, setHeroes] = useState([]);
  // Where the troop/hero starting values came from, when not this cycle's saved answer.
  const [troopSource, setTroopSource] = useState(null);
  const [onFile, setOnFile] = useState(null);
  const [status, setStatus] = useState('');
  const [isError, setIsError] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const response = await fetch('/api/kvk-availability', { cache: 'no-store' });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Could not load your saved availability.');
        if (!cancelled) {
          // This cycle's answer if saved, otherwise the latest earlier answer, otherwise what we know
          // from other forms. A starting point only: nothing is saved until Save.
          const start = result.record || result.previous || null;
          const base = result.base || {};
          setOnFile(result.record || null);
          setName(start?.name || result.row?.name || identity?.name || result.identity?.name || '');
          setCurrentAlliance(start?.current_alliance || result.row?.current_alliance || base.current_alliance || '');
          setAvailability(start?.availability || '');
          const prefill = result.prefill;
          if (prefill) {
            setTroops(prefill.troops || {});
            setHeroes(prefill.heroes || []);
            const used = [prefill.troopsFrom, prefill.heroesFrom].filter(Boolean);
            const worst = used.includes('profile') ? 'profile' : used.includes('previous') ? 'previous' : null;
            // With no saved answer this cycle, the page-level notice already explains a carried-over form.
            setTroopSource(worst === 'profile' || (worst === 'previous' && result.record)
              ? { kind: worst, label: result.previous?.event_cycle_label || 'an earlier cycle' }
              : null);
          }
        }
      } catch (error) {
        if (!cancelled) {
          setIsError(true);
          setStatus(error.message);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setStatus('');
    setIsError(false);
    if (!name.trim() || !currentAlliance || !availability) {
      setIsError(true);
      setStatus('Enter your name and select alliance and availability.');
      return;
    }
    setLoading(true);
    try {
      const response = await fetch('/api/kvk-availability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          current_alliance: currentAlliance,
          availability,
          ...troops,
          heroes,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not save your availability.');
      setOnFile(result.row);
      setTroopSource(null);
      setStatus('Saved. Your KvK availability is done for this cycle.');
      refreshMemberFormStatus();
    } catch (error) {
      setIsError(true);
      setStatus(error.message || 'Could not save. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="public-shell single-form">
      <section className="public-intro">
        <span className="public-kicker">{intro.kicker}</span>
        <h1>{intro.heading}</h1>
        <p>{intro.description}</p>
      </section>
      <form className="public-form-card" onSubmit={handleSubmit}>
        <div className="form-section-header">
          <span>KvK Availability</span>
          <h2>Tell us when you can play and what you are bringing.</h2>
          <p>Your availability, troop levels and heroes are for this KvK. They are filled in from your last answers, so just check them and press Save.</p>
        </div>
        <IdentityFields memberId={memberId} name={name} onNameChange={setName} known={Boolean(identity?.name)} />
        <section className="troop-section public-section">
          <div className="section-title-row">
            <span>Alliance</span>
            <h3>Current Alliance</h3>
            <p>Select the alliance you are currently in.</p>
          </div>
          <label>
            Current Alliance
            <select value={currentAlliance} onChange={(e) => setCurrentAlliance(e.target.value)}>
              <option value="">Select alliance</option>
              {ALLIANCES.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </label>
        </section>
        {onFile && (
          <div className="on-file">
            Currently on file — Alliance: {onFile.current_alliance || '-'} · Availability:{" "}
            {onFile.availability || '-'}
            {onFile.heroes?.length ? <> · Heroes: {onFile.heroes.length}</> : null}
          </div>
        )}
        <section className="troop-section public-section">
          <div className="section-title-row">
            <span>Timing</span>
            <h3>Battle availability</h3>
            <p>Select the window rally planners should count on.</p>
          </div>
          <div className="availability-grid">
            {AVAILABILITY_OPTIONS.map((option) => (
              <label
                key={option}
                className={availability === option ? 'availability-choice selected' : 'availability-choice'}
              >
                <input
                  type="radio"
                  name="availability"
                  checked={availability === option}
                  onChange={() => setAvailability(option)}
                />
                <span>{option}</span>
              </label>
            ))}
          </div>
        </section>
        {troopSource && (
          <UpsertNotice
            known
            prefillOnly
            previousLabel={troopSource.kind === 'previous' ? troopSource.label : null}
            fromLabel={troopSource.kind === 'profile' ? 'your Power Profile' : null}
          />
        )}
        <section className="troop-section public-section">
          <div className="section-title-row">
            <span>Army</span>
            <h3>Troop levels</h3>
            <p>Choose the best tier and TG for each troop type, as they stand for this KvK.</p>
          </div>
          <TroopLevelFields
            values={troops}
            onChange={(key, value) => setTroops((current) => ({ ...current, [key]: value }))}
          />
        </section>
        <section className="troop-section public-section">
          <div className="section-title-row">
            <span>Heroes</span>
            <h3>Hero roster</h3>
            <p>Select the heroes you have available for this KvK.</p>
          </div>
          <HeroRosterPicker
            catalog={heroCatalog}
            heroes={heroes}
            onToggle={(hero) => setHeroes((current) => (current.includes(hero) ? current.filter((h) => h !== hero) : [...current, hero]))}
          />
        </section>
        {status && <div className={isError ? 'status error' : 'status'}>{status}</div>}
        <button type="submit" disabled={loading}>
          {loading ? 'Submitting...' : 'Save KvK Availability'}
        </button>
      </form>
    </div>
  );
}
