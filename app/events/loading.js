import { Skeleton } from '../../components/ui';

export default function Loading() {
  return (
    <main className="ui-skeleton-screen theme-realm" aria-busy="true">
      <span className="sr-only" role="status">Loading events…</span>
      <div className="ui-page-skeleton">
        <div className="ui-skel-head">
          <Skeleton width="120px" height={12} />
          <Skeleton width="min(480px, 78%)" height={40} />
          <Skeleton width="min(560px, 88%)" height={16} />
        </div>
        <div className="ui-skel-row">
          {[160, 160, 160].map((w, i) => (
            <div className="ui-skel-card" key={i} style={{ flex: '1 1 200px', minWidth: 0 }}>
              <Skeleton width="55%" height={14} />
              <Skeleton width="80%" height={26} />
              <Skeleton width="45%" height={12} />
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div className="ui-skel-card" key={i}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-4)' }}>
                <Skeleton width="40%" height={18} />
                <Skeleton width="90px" height={18} radius="var(--radius-pill)" />
              </div>
              <Skeleton width="100%" height={12} />
              <Skeleton width="70%" height={12} />
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
