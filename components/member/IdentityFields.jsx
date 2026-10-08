import './identity-fields.css';

// Shared identity block for member forms. The Member ID is the player's login: shown as locked text
// (not an input), never editable. The name is prefilled from the server (`identity` prop, no fetch)
// and stays editable so a member can correct their in-game name.
export function MemberIdLocked({ memberId, id = 'member-id-locked' }) {
  return (
    <div className="member-identity-field">
      <span className="member-identity-label" id={`${id}-label`}>Member ID</span>
      <div className="member-identity-locked" aria-describedby={`${id}-hint`} data-testid="member-id-locked">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
        <span>{memberId || '(not signed in)'}</span>
      </div>
      <p className="member-identity-hint" id={`${id}-hint`}>From your login. It cannot be changed.</p>
    </div>
  );
}

export default function IdentityFields({ memberId, name, onNameChange, label = 'Your name', known = true, inputProps = {}, invalid, describedBy }) {
  return (
    <div className="member-identity">
      <div className="member-identity-field">
        <label>
          <span className="member-identity-label">{label}</span>
          <input
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="Your in-game name"
            autoComplete="off"
            maxLength={120}
            aria-invalid={invalid ? 'true' : undefined}
            aria-describedby={['member-name-hint', describedBy].filter(Boolean).join(' ')}
            {...inputProps}
          />
        </label>
        <p className="member-identity-hint" id="member-name-hint">{known ? 'From your account. Change it if it is wrong.' : 'We could not find your in-game name. Type it here.'}</p>
      </div>
      <MemberIdLocked memberId={memberId} />
    </div>
  );
}
