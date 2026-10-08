import { getBlocks, checkIsAdmin } from '../../lib/contentBlocks';
import { getFormGate } from '../../lib/formGates.server.js';
import EditableSection from '../../components/EditableSection';
import UpsertNotice from '../../components/member/UpsertNotice';
import FormClosedNotice from '../../components/FormClosedNotice';
import { getPublicHeroes } from '../../lib/heroCatalog.server.js';
import FlamedragonClient from './FlamedragonClient';

export const metadata = {
  title: 'Flamedragon Tyrant Form',
};

export default async function FlamedragonPage() {
  const [blocks, isAdmin, gate, heroCatalog] = await Promise.all([
    getBlocks('flamedragon-intro'),
    checkIsAdmin(),
    getFormGate('dragon'),
    getPublicHeroes(),
  ]);
  const hasIntro = Array.isArray(blocks) && blocks.length > 0;
  const intro =
    hasIntro || isAdmin ? (
      <EditableSection
        page="flamedragon-intro"
        initialBlocks={blocks}
        isAdmin={isAdmin}
        as="section"
        className="armory-notice"
      />
    ) : null;
  if (gate.is_open === false && !isAdmin) {
    return (
      <main className="page public-page">
        {intro}
        <FormClosedNotice message={gate.message} />
      </main>
    );
  }
  return <FlamedragonClient heroCatalog={heroCatalog} intro={<><UpsertNotice formKey="dragon" />{intro}</>} />;
}
