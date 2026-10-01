import { renderOgCard, OG_SIZE, OG_CONTENT_TYPE } from '../lib/ogCard';

export const alt = 'K710 Hub - Kingdom 710';
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return renderOgCard({
    title: 'Kingdom 710',
    subtitle: 'Events, alliance schedules, guides, tools and transfer applications.',
  });
}
