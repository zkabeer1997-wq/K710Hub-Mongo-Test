import { getBlocks, checkIsAdmin } from '../../lib/contentBlocks';
import EditableSection from '../../components/EditableSection';
import PlayerRecordGate from './PlayerRecordGate';

export const metadata = {
  title: 'K710 Member Login',
  alternates: { canonical: '/player-record' },
};

export default async function PlayerRecordPage({ searchParams: searchParamsPromise }) {
  const [blocks, isAdmin, searchParams] = await Promise.all([
    getBlocks('player-record-banner'),
    checkIsAdmin(),
    searchParamsPromise,
  ]);
  const hasBanner = Array.isArray(blocks) && blocks.length > 0;
  const banner = (hasBanner || isAdmin) ? (
    <EditableSection page="player-record-banner" initialBlocks={blocks} isAdmin={isAdmin} as="div" className="gatehouse-notice" />
  ) : null;
  const next = typeof searchParams?.next === 'string' ? searchParams.next : '';
  const adminAccessRequested = searchParams?.admin === '1' || String(next || '').startsWith('/admin');
  return <PlayerRecordGate banner={banner} next={next} adminAccessRequested={adminAccessRequested} />;
}
