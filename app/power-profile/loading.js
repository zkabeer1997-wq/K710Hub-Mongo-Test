import { Skeleton } from '../../components/ui';

export default function Loading() {
  return (
    <main className="ui-skeleton-screen" aria-busy="true">
      <span className="sr-only" role="status">Loading power profile…</span>
      <div className="ui-page-skeleton">
        <div className="ui-skel-head">
          <Skeleton width="130px" height={12} />
          <Skeleton width="min(460px, 78%)" height={40} />
          <Skeleton width="min(560px, 88%)" height={16} />
        </div>
        <div className="ui-skel-row">
          {[1, 2, 3, 4, 5].map((n) => (
            <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flex: '1 1 120px', minWidth: 0 }}>
              <Skeleton width="26px" height={26} radius="var(--radius-pill)" />
              <Skeleton width="70%" height={12} />
            </div>
          ))}
        </div>
        <div className="ui-skel-card">
          <Skeleton width="45%" height={22} />
          <Skeleton width="100%" height={12} />
          <div className="ui-skel-grid" style={{ marginTop: 'var(--space-3)' }}>
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                <Skeleton width="50%" height={12} />
                <Skeleton width="100%" height={44} radius="var(--radius-sm)" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
