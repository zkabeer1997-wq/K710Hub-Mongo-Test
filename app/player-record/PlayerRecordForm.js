'use client';

import { useState, useEffect } from 'react';
import { KVK_ALLIANCES, KVK_AVAILABILITY_OPTIONS } from '../../lib/playerCombatOptions.mjs';

const AVAILABILITY_OPTIONS = KVK_AVAILABILITY_OPTIONS;
const ALLIANCES = KVK_ALLIANCES;

export default function PlayerRecordForm({ initialMemberId = '' }) {
const [name, setName] = useState('');
const [memberId, setMemberId] = useState(initialMemberId);
const [availability, setAvailability] = useState('');
  const [currentAlliance, setCurrentAlliance] = useState('');
const [pin, setPin] = useState('');
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
if (!cancelled && result.row) {
setOnFile(result.row);
setName(result.row.name || '');
setMemberId(result.row.member_id);
setCurrentAlliance(result.row.current_alliance || '');
setAvailability(result.row.availability || '');
}
} catch (error) {
if (!cancelled) { setIsError(true); setStatus(error.message); }
} finally {
if (!cancelled) setLoading(false);
}
}
load();
return () => { cancelled = true; };
}, []);

async function handleSubmit(e) {
e.preventDefault();
setStatus('');
setIsError(false);
if (!name.trim() || !memberId || !pin || !currentAlliance || !availability) {
setIsError(true);
setStatus('Enter your name and PIN, and select your alliance and availability.');
return;
}
setLoading(true);
try {
const response = await fetch('/api/kvk-availability', {
method: 'POST',
headers: { 'Content-Type': 'application/json' },
body: JSON.stringify({ name, member_id: memberId, current_alliance: currentAlliance, availability, pin }),
});
const result = await response.json();
if (!response.ok) throw new Error(result.error || 'Could not save your availability.');
setOnFile(result.row);
setStatus('Saved your alliance and KvK availability.');
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
<span className="public-kicker">KvK Availability</span>
<h1>Battle availability</h1>
<p>Tell kingdom leadership when you can participate in KvK.</p>
<div className="public-intro-stats" aria-label="Submission checklist">
<div>
<strong>1</strong>
<span>Quick form</span>
</div>
<div>
<strong>UTC</strong>
<span>Battle time</span>
</div>
<div>
<strong>{availability ? 'Set' : 'Open'}</strong>
<span>Availability</span>
</div>
</div>
</section>
<form className="public-form-card" onSubmit={handleSubmit}>
<div className="form-section-header">
<span>KvK Availability</span>
<h2>Tell us when you can join.</h2>
</div>
<section className="identity-grid">
<label>Your name<input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your in-game name" /></label>
<label>Member ID<input value={memberId} readOnly placeholder="Your Member ID" /></label>
</section>
<section className="troop-section public-section">
<div className="section-title-row"><span>Alliance</span><h3>Current Alliance</h3><p>Select the alliance you are currently in.</p></div>
<label>Current Alliance<select value={currentAlliance} onChange={(e) => setCurrentAlliance(e.target.value)}><option value="">Select alliance</option>{ALLIANCES.map((a) => <option key={a} value={a}>{a}</option>)}</select></label>
</section>
{onFile && (
<div className="on-file">
Currently on file — Alliance: {onFile.current_alliance || '-'} · Availability: {onFile.availability || '-'}
</div>
)}
<section className="troop-section public-section">
<div className="section-title-row"><span>Timing</span><h3>Battle availability</h3><p>Select the window rally planners should count on.</p></div>
<div className="availability-grid">
{AVAILABILITY_OPTIONS.map((option) => (
<label key={option} className={availability === option ? 'availability-choice selected' : 'availability-choice'}>
<input type="radio" name="availability" checked={availability === option} onChange={() => setAvailability(option)} />
<span>{option}</span>
</label>
))}
</div>
</section>
<section className="pin-panel">
<label>Enter your PIN<input type="password" value={pin} onChange={(e) => setPin(e.target.value)} placeholder="Your PIN" /></label>
<p className="hint">Enter the same PIN you use to sign in.</p>
</section>
{status && <div className={isError ? 'status error' : 'status'}>{status}</div>}
<button type="submit" disabled={loading}>{loading ? 'Submitting...' : 'Save KvK Availability'}</button>
</form>
</div>
);
}
