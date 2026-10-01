import { renderOgCard, OG_SIZE, OG_CONTENT_TYPE } from '../../lib/ogCard';

export const alt = 'K710 Tools & Calculators';
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return renderOgCard({
    eyebrow: 'Kingdom 710 · Members',
    title: 'Tools & Calculators',
    subtitle: 'Gear, charms, pets, construction and research planners.',
  });
}
