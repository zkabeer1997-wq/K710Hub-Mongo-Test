export default function manifest() {
  return {
    name: 'K710 Hub',
    short_name: 'K710',
    description: 'The Kingdom 710 website for events, alliance schedules, member forms, guides, calculators, and transfer applications.',
    start_url: '/',
    display: 'standalone',
    background_color: '#0b0e13',
    theme_color: '#0b0e13',
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
  };
}
