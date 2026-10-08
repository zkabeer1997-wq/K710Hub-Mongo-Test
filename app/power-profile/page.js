import { getBlocks, checkIsAdmin } from '../../lib/contentBlocks';
import { getFormGate } from '../../lib/formGates.server.js';
import EditableSection from '../../components/EditableSection';
import UpsertNotice from '../../components/member/UpsertNotice';
import FormClosedNotice from '../../components/FormClosedNotice';
import { getPageIdentity } from '../../lib/memberPrefill.server.js';
import PowerProfileClient from './PowerProfileClient';

export const metadata = {
  title: 'Power Profile',
};

export default async function PowerProfilePage() {
  const [blocks, isAdmin, gate, identity] = await Promise.all([
    getBlocks('power-profile-intro'),
    checkIsAdmin(),
    getFormGate('lead'),
    getPageIdentity(),
  ]);
  const hasIntro = Array.isArray(blocks) && blocks.length > 0;
  const intro =
    hasIntro || isAdmin ? (
      <EditableSection
        page="power-profile-intro"
        initialBlocks={blocks}
        isAdmin={isAdmin}
        as="section"
        className="armory-notice"
      />
    ) : null;
  if (gate.is_open === false && !isAdmin) {
    return (
      <main className="armory">
        <div className="armory-inner">
          {intro}
          <FormClosedNotice message={gate.message} />
        </div>
      </main>
    );
  }
  return <PowerProfileClient identity={identity} intro={<><UpsertNotice formKey="lead" />{intro}</>} />;
}
