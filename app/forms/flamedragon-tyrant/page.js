import MusterHall from '../../../components/kingdom/world/MusterHall';
import { getFormGates } from '../../../lib/formGates.mjs';

export const metadata = {
  title: 'K710 Flamedragon Tyrant Forms',
};

export default async function FlamedragonTyrantFormsPage({ searchParams: searchParamsPromise }) {
  const searchParams = await searchParamsPromise;
  const memberId = typeof searchParams?.member_id === 'string' ? searchParams.member_id : '';
  const gates = await getFormGates();
  const closedKeys = Object.values(gates)
    .filter((gate) => gate.is_open === false)
    .map((gate) => gate.form_key);
  return <MusterHall memberId={memberId} closedKeys={closedKeys} variant="flamedragon-tyrant" />;
}
