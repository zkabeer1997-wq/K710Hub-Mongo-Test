import { ImageResponse } from 'next/og';

// Shared 1200x630 social card: dark obsidian, gold K710 shield mark.
// System serif only - no remote font fetch, so it renders with no network.
export const OG_SIZE = { width: 1200, height: 630 };
export const OG_CONTENT_TYPE = 'image/png';

function Shield() {
  return (
    <div style={{ display: 'flex', position: 'relative', width: 132, height: 132, alignItems: 'center', justifyContent: 'center' }}>
      <svg width="132" height="132" viewBox="0 0 40 40" fill="none" style={{ position: 'absolute', top: 0, left: 0 }}>
        <path d="M20 4 L33 8.5 V19 C33 26.5 28 31.5 20 35 C12 31.5 7 26.5 7 19 V8.5 Z" stroke="#d9a94e" strokeWidth="1.6" />
      </svg>
      <div style={{ display: 'flex', fontSize: 40, fontWeight: 900, color: '#d9a94e', marginTop: -6 }}>710</div>
    </div>
  );
}

export function renderOgCard({ eyebrow = 'Kingdom 710 · Kingshot', title = 'K710 Hub', subtitle = '' }) {
  const t = String(title).slice(0, 110);
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          padding: '72px 80px',
          background: 'linear-gradient(135deg, #0b0e13 0%, #171309 100%)',
          color: '#f1e7cf',
          fontFamily: 'Georgia, serif',
          borderBottom: '8px solid #d9a94e',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, paddingRight: 48 }}>
          <div style={{ display: 'flex', fontSize: 26, letterSpacing: 5, textTransform: 'uppercase', color: '#d9a94e' }}>{eyebrow}</div>
          <div style={{ display: 'flex', fontSize: t.length > 48 ? 56 : 76, fontWeight: 700, marginTop: 28, lineHeight: 1.1 }}>{t}</div>
          {subtitle ? (
            <div style={{ display: 'flex', fontSize: 28, marginTop: 28, color: '#a9afbf', lineHeight: 1.3 }}>{String(subtitle).slice(0, 140)}</div>
          ) : null}
          <div style={{ display: 'flex', fontSize: 22, marginTop: 44, color: '#7d8394', letterSpacing: 3 }}>K710 HUB</div>
        </div>
        <Shield />
      </div>
    ),
    { ...OG_SIZE },
  );
}
