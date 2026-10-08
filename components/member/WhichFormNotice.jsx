// A short plain-words reminder on the Noble Advisor (Flamedragon Tyrant) form. The KvK buffs now
// live in one form, KvK Prep & Appointments, so only the Noble Advisor page keeps a notice.
const COPY = {
  noble: {
    text: 'Flamedragon Tyrant only has the Noble Advisor buff. There is no Chief Minister buff in this event.',
  },
};

export default function WhichFormNotice({ kind }) {
  const c = COPY[kind];
  if (!c) return null;
  return (
    <aside className="which-form-notice" aria-label="About this form">
      <p><strong>{c.text}</strong></p>
    </aside>
  );
}
