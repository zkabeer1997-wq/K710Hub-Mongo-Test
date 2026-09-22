import { Skeleton } from '../../components/ui';

export default function Loading() {
  return (
    <main className="ui-skeleton-screen theme-realm" aria-busy="true">
      <span className="sr-only" role="status">Loading guides…</span>
      <div className="ui-page-skeleton">
        <div className="ui-skel-head">
          <Skeleton width="110px" height={12} />
          <Skeleton width="min(420px, 74%)" height={40} />
          <Skeleton width="min(540px, 88%)" height={16} />
        </div>
        <div className="ui-skel-row" style={{ alignItems: 'flex-end' }}>
          <Skeleton width="min(320px, 60%)" height={44} radius="var(--radius-sm)" />
          {[70, 90, 110, 80].map((w, i) => (
            <Skeleton key={i} width={`${w}px`} height={34} radius="var(--radius-sm)" />
          ))}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          {Array.from({ length: 5 }).map((_, i) => (
            <div className="ui-skel-card" key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 'var(--space-4)' }}>
              <Skeleton width="52px" height={52} radius="var(--radius-md)" />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', flex: 1, minWidth: 0 }}>
                <Skeleton width="30%" height={12} />
                <Skeleton width="60%" height={18} />
                <Skeleton width="90%" height={12} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
