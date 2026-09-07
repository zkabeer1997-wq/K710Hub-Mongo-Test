import { getBlocks, checkIsAdmin } from '../../lib/contentBlocks';
import { getFormGate } from '../../lib/formGates.mjs';
import EditableSection from '../../components/EditableSection';
import FormClosedNotice from '../../components/FormClosedNotice';
import PowerProfileClient from './PowerProfileClient';

export const metadata = {
title: 'K710 Player Profile',
};

export default async function PowerProfilePage() {
const [blocks, isAdmin, gate] = await Promise.all([
getBlocks('power-profile-intro'),
checkIsAdmin(),
getFormGate('lead'),
]);
const hasIntro = Array.isArray(blocks) && blocks.length > 0;
const intro = (hasIntro || isAdmin) ? (
<EditableSection page="power-profile-intro" initialBlocks={blocks} isAdmin={isAdmin} as="section" className="armory-notice" />
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
return <PowerProfileClient intro={intro} />;
}
