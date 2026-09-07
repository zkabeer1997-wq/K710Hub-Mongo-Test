'use client';

import { useEffect, useRef } from 'react';
import { formatUnitLevel } from '../../lib/kvkMembersExport.mjs';

function Detail({ label, value }) {
  return <div className="admin-drawer-field"><span>{label}</span><strong>{value || '—'}</strong></div>;
}

export default function MemberDetailsDrawer({ open, member, rallyName, onClose, onDelete, deleting, confirming }) {
  const drawerRef = useRef(null);
  const closeRef = useRef(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  useEffect(() => {
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);

  useEffect(() => {
    if (confirming) return;
    // A cancelled removal returns keyboard focus to this drawer.
    closeRef.current?.focus();
    function onKeyDown(event) {
      if (event.key === 'Escape') onCloseRef.current();
      if (event.key !== 'Tab') return;
      const controls = [...drawerRef.current.querySelectorAll('button:not(:disabled), a[href], [tabindex="0"]')];
      const first = controls[0];
      const last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault(); last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first?.focus();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [confirming]);

  if (!open || !member) return null;

  return (
    <div className="admin-drawer-overlay" role="presentation" onClick={onClose}>
      <div ref={drawerRef} className="admin-drawer member-details-drawer" role="dialog" aria-modal="true" aria-labelledby="member-details-title" onClick={(event) => event.stopPropagation()}>
        <div className="admin-drawer-header">
          <h2 id="member-details-title">{member.name || 'Member'}</h2>
          <button ref={closeRef} type="button" className="admin-drawer-close" onClick={onClose} aria-label="Close member details">&times;</button>
        </div>
        <section className="admin-drawer-section">
          <h3>Member</h3>
          <div className="admin-drawer-grid">
            <Detail label="Player Name" value={member.name} />
            <Detail label="Player ID" value={member.member_id} />
            <Detail label="Alliance" value={member.current_alliance} />
            <Detail label="Availability" value={member.availability} />
            <Detail label="Updated" value={member.updated_at && new Date(member.updated_at).toLocaleString()} />
            <Detail label="Rally" value={rallyName || 'Unassigned'} />
          </div>
        </section>
        <section className="admin-drawer-section">
          <h3>Troop Levels</h3>
          <div className="member-detail-list">
            {['infantry', 'cavalry', 'archer'].map((unit) => <Detail key={unit} label={unit} value={formatUnitLevel(member[`${unit}_tier`], member[`${unit}_tg`])} />)}
          </div>
        </section>
        <section className="admin-drawer-section">
          <h3>Heroes ({(member.heroes || []).length})</h3>
          <p className="member-detail-text">{(member.heroes || []).join(', ') || 'No heroes on file.'}</p>
        </section>
        <section className="admin-drawer-section">
          <h3>Player Profile</h3>
          {member.power_profile ? (
            <div className="member-detail-list">
              {[
                ['governor_gear', 'Governor Gear'], ['charms', 'Charms'], ['hero_gear', 'Hero Gear'],
                ['pet_power', 'Pet Power'], ['masters_power', 'Masters Power'],
              ].map(([key, label]) => <Detail key={key} label={label} value={member.power_profile[key]} />)}
              <Detail label="Profile updated" value={member.player_profile_updated_at && new Date(member.player_profile_updated_at).toLocaleString()} />
              <Detail label="Availability updated" value={member.event_updated_at && new Date(member.event_updated_at).toLocaleString()} />
            </div>
          ) : <p className="member-detail-text">No Player Profile on file.</p>}
        </section>
        <div className="admin-drawer-actions">
          <button type="button" className="delete-entry-btn" onClick={() => onDelete(member)} disabled={deleting}>{deleting ? 'Removing…' : 'Remove member'}</button>
        </div>
      </div>
    </div>
  );
}
