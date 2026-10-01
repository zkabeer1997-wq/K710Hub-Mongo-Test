import { Skeleton } from '../../components/ui';

export default function Loading() {
  return (
    <main className="ui-skeleton-screen" aria-busy="true">
      <span className="sr-only" role="status">Loading member dashboard…</span>
      <div className="ui-page-skeleton" style={{ maxWidth: 'min(520px, 100%)' }}>
        <div className="ui-skel-head" style={{ alignItems: 'center', textAlign: 'center' }}>
          <Skeleton width="64px" height={64} radius="var(--radius-pill)" />
          <Skeleton width="70%" height={32} />
          <Skeleton width="85%" height={14} />
        </div>
        <div className="ui-skel-card">
          <Skeleton width="40%" height={12} />
          <Skeleton width="100%" height={44} radius="var(--radius-sm)" />
          <Skeleton width="40%" height={12} />
          <Skeleton width="100%" height={44} radius="var(--radius-sm)" />
          <Skeleton width="100%" height={46} radius="var(--radius-sm)" />
        </div>
      </div>
    </main>
  );
}
