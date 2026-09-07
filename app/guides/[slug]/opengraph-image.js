import { ImageResponse } from 'next/og';
import { createAdminSupabaseClient } from '../../../lib/adminSupabase';

export const alt = 'Kingdom 710 Guide';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

async function loadTitleAndCategory(slug) {
  try {
    const supabase = createAdminSupabaseClient();
    const { data } = await supabase
      .from('kingdom_guides')
      .select('title, category, is_published')
      .eq('slug', slug)
      .maybeSingle();
    if (!data || !data.is_published) return null;
    return data;
  } catch {
    return null;
  }
}

// Typographic only - no fabricated art or imagery, consistent with the
// portal plan's rule against copying any visual asset. Same dark/gold
// palette as the console surface's existing look.
export default async function Image({ params }) {
  const { slug } = await params;
  const guide = await loadTitleAndCategory(slug);
  const title = guide?.title || 'Kingdom Guide';
  const category = guide?.category || 'K710 Library';

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '80px',
          background: 'linear-gradient(135deg, #14100a 0%, #241a12 100%)',
          color: '#e8dcc0',
          fontFamily: 'Georgia, serif',
        }}
      >
        <div style={{ display: 'flex', fontSize: 28, letterSpacing: 4, textTransform: 'uppercase', color: '#c9a44e' }}>
          {category}
        </div>
        <div style={{ display: 'flex', fontSize: 64, fontWeight: 700, marginTop: 24, lineHeight: 1.15, maxWidth: 980 }}>
          {title}
        </div>
        <div style={{ display: 'flex', fontSize: 26, marginTop: 48, color: '#9aa1b4', letterSpacing: 2 }}>
          KINGDOM 710 · KINGSHOT
        </div>
      </div>
    ),
    { ...size },
  );
}
