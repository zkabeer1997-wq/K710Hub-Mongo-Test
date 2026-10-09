import Link from 'next/link';
import EditableSection from '../../components/EditableSection';
import { getBlocks, checkIsAdmin } from '../../lib/contentBlocks';
import InterestForm from './InterestForm';
import { getActiveIntakePeriod } from '../../lib/transferIntakePeriods.server';
import PageHero from '../../components/ui/PageHero';
import TourLauncher from '../../components/tour/TourLauncher';

export const metadata = {
  title: 'Apply to join Kingdom 710',
  description: 'Apply to transfer into Kingdom 710. It takes about 5 minutes and you can stop and come back.',
  alternates: { canonical: '/interest' },
};

export default async function InterestPage() {
  const [introBlocks, isAdmin, initialPeriod] = await Promise.all([
    getBlocks('interest-intro'),
    checkIsAdmin(),
    // undefined = unknown (the form then asks the API itself).
    getActiveIntakePeriod().then((p) => p?.label || null).catch(() => undefined),
  ]);

  // Single column focused on the form. The editable block is still rendered
  // (admins can add a notice above the form) but reserves no space when empty.
  const hasIntro = Array.isArray(introBlocks) && introBlocks.length > 0;

  return (
    <main className="registry">
      <div className="registry-atmos" aria-hidden="true" />
      <div className="registry-inner">
        <PageHero
          tone="console"
          className="registry-head"
          eyebrow="Kingdom 710 · Transfer application"
          title="Apply to join Kingdom 710"
          lede="Answer a few questions about your account and your power. It takes about 5 minutes. You can stop and come back: your answers are saved on this device. Our officers read every application."
          actions={<><TourLauncher id="interest" /><Link href="/alliances" className="registry-head-link">Check alliance schedules first →</Link><a href="/help" className="registry-head-link">Need help?</a><a href="/interest/status" className="registry-head-link">Already applied? Check status</a></>}
        />

        {(hasIntro || isAdmin) && (
          <EditableSection
            page="interest-intro"
            initialBlocks={introBlocks}
            isAdmin={isAdmin}
            as="section"
            className="registry-notice"
          />
        )}

        <InterestForm initialPeriod={initialPeriod} />
      </div>
    </main>
  );
}
