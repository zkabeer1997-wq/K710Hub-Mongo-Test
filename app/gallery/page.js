import GalleryGrid from '../../components/gallery/GalleryGrid';
import { getGalleryImages } from '../../lib/gallery';

export const metadata = {
  title: 'Gallery',
  description: 'Photos and shared moments from Kingdom 710.',
  alternates: { canonical: '/gallery' },
};

export const dynamic = 'force-dynamic';

export default async function GalleryPage() {
  let images = [];
  let loadError = false;
  try { images = await getGalleryImages(); } catch (error) { console.error('gallery page load failed', error); loadError = true; }

  return (
    <main className="theme-realm gallery-page">
      <header className="gallery-hero">
        <h1>Kingdom Gallery</h1>
        <p>Events, victories, and the people behind Kingdom 710.</p>
      </header>
      <section className="gallery-body" aria-label="Kingdom photos">
        {loadError ? <p className="gallery-empty">The gallery could not be loaded. Please try again.</p> : images.length ? <GalleryGrid images={images} /> : <p className="gallery-empty">No photos have been published yet.</p>}
      </section>
    </main>
  );
}

