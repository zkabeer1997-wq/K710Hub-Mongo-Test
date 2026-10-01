import EditableSection from '../../components/EditableSection';
import { getBlocks, checkIsAdmin } from '../../lib/contentBlocks';
import InterestForm from './InterestForm';
import PageHero from '../../components/ui/PageHero';

export const metadata = {
  title: 'The Registry',
  description: 'Petition the registry to transfer into Kingdom 710.',
  alternates: { canonical: '/interest' },
};

export default async function InterestPage() {
  const [introBlocks, isAdmin] = await Promise.all([
    getBlocks('interest-intro'),
    checkIsAdmin(),
  ]);

  // The narrative rail moved to the Chronometer Chamber, so the registry is
  // now a single column focused on the petition itself. The editable block
  // is still rendered (admins can add a notice above the form) but no longer
  // reserves an empty column when it has no content.
  const hasIntro = Array.isArray(introBlocks) && introBlocks.length > 0;

  return (
    <main className="registry">
      <div className="registry-atmos" aria-hidden="true" />
      <div className="registry-inner">
        <PageHero
          tone="console"
          className="registry-head"
          eyebrow="The Registry · Transfer application"
          title="Petition for Entry"
          lede="State your name, your strength, and your intent. The council reviews every petition before intake opens."
          actions={<a href="/about#alliances" className="registry-head-link">Want to check alliance schedules first? →</a>}
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

        <InterestForm />
      </div>
    </main>
  );
}
