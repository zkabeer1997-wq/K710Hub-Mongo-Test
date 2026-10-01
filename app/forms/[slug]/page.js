import { notFound } from 'next/navigation';
import Breadcrumbs from '../../../components/Breadcrumbs';
import PageHero from '../../../components/ui/PageHero';
import EventParticipationForm from '../../../components/member/EventParticipationForm';
import { findEventForm } from '../../../lib/eventForms.mjs';

// Each event vote has its own shareable URL: /forms/swordland-showdown, etc.
// Static form routes (/forms/kvk, /forms/requests, ...) win over this segment.
// Dynamic (the root layout reads headers() for the CSP nonce); unknown slugs 404.
export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const form = findEventForm(slug);
  return form ? { title: `${form.title} vote`, alternates: { canonical: `/forms/${form.slug}` } } : { title: 'Form' };
}

export default async function EventFormPage({ params }) {
  const { slug } = await params;
  const form = findEventForm(slug);
  if (!form) notFound();
  return (
    <main className="event-form-page">
      <Breadcrumbs items={[{ label: 'Members', href: '/dashboard' }, { label: 'Forms', href: '/forms' }]} current={`${form.title} vote`} />
      <PageHero tone="console" eyebrow="Kingdom 710 · Members" title={`${form.title} vote`} lede="Tell leadership whether you can take part, and your current power." />
      <EventParticipationForm form={{ slug: form.slug, title: form.title }} />
    </main>
  );
}
