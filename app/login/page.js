import PlayerRecordGate from '../player-record/PlayerRecordGate';

export const metadata = {
  title: 'Member login · K710 Hub',
  alternates: { canonical: '/login' },
};

export default async function LoginPage({ searchParams: searchParamsPromise }) {
  const searchParams = await searchParamsPromise;
  const next = typeof searchParams?.next === 'string' ? searchParams.next : '';
  const adminAccessRequested = searchParams?.admin === '1' || String(next || '').startsWith('/admin');
  return <PlayerRecordGate next={next} adminAccessRequested={adminAccessRequested} />;
}
