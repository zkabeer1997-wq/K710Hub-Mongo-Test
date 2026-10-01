import GalleryGrid from '../../components/gallery/GalleryGrid';
import { getGalleryImages } from '../../lib/gallery';

export const metadata = {
  title: 'Gallery',
  description: 'Photos and shared moments from Kingdom 710.',
  alternates: { canonical: '/gallery' },
};

import PageHero from '../../components/ui/PageHero';

export const dynamic = 'force-dynamic';

export default async function GalleryPage() {
  let images = [];
  let loadError = false;
  try { images = await getGalleryImages(); } catch (error) { console.error('gallery page load failed', error); loadError = true; }

  return (
    <main className="theme-realm gallery-page">
      <PageHero eyebrow="Kingdom 710" title="Kingdom Gallery" lede="Events, victories, and the people behind Kingdom 710." />
      <section className="gallery-body" aria-label="Kingdom photos">
        {loadError ? <p className="gallery-empty">The gallery could not be loaded. Please try again.</p> : images.length ? <GalleryGrid images={images} /> : <p className="gallery-empty">No photos have been published yet.</p>}
      </section>
    </main>
  );
}

