import { getBlocks, checkIsAdmin } from '../../lib/contentBlocks';
import { getFormGate } from '../../lib/formGates.mjs';
import EditableSection from '../../components/EditableSection';
import FormClosedNotice from '../../components/FormClosedNotice';
import FlamedragonClient from './FlamedragonClient';

export const metadata = {
  title: 'K710 Flamedragon Tyrant Form',
};

export default async function FlamedragonPage() {
  const [blocks, isAdmin, gate] = await Promise.all([
    getBlocks('flamedragon-intro'),
    checkIsAdmin(),
    getFormGate('dragon'),
  ]);
  const hasIntro = Array.isArray(blocks) && blocks.length > 0;
const intro = (hasIntro || isAdmin) ? (
<EditableSection page="flamedragon-intro" initialBlocks={blocks} isAdmin={isAdmin} as="section" className="armory-notice" />
) : null;
  if (gate.is_open === false && !isAdmin) {
    return (
      <main className="page public-page">
        {intro}
        <FormClosedNotice message={gate.message} />
      </main>
    );
  }
  return <FlamedragonClient intro={intro} />;
}
