import { Skeleton } from '../../components/ui';

export default function Loading() {
  return (
    <main className="ui-skeleton-screen" aria-busy="true">
      <span className="sr-only" role="status">Loading tools and calculators…</span>
      <div className="ui-page-skeleton">
        <div className="ui-skel-head">
          <Skeleton width="140px" height={12} />
          <Skeleton width="min(520px, 80%)" height={40} />
          <Skeleton width="min(420px, 70%)" height={16} />
        </div>
        <div className="ui-skel-row">
          {[80, 120, 100, 140, 90].map((w, i) => (
            <Skeleton key={i} width={`${w}px`} height={34} radius="var(--radius-pill)" />
          ))}
        </div>
        <div className="ui-skel-grid">
          {Array.from({ length: 9 }).map((_, i) => (
            <div className="ui-skel-card" key={i}>
              <Skeleton width="46px" height={46} radius="var(--radius-md)" />
              <Skeleton width="70%" height={18} />
              <Skeleton width="100%" height={12} />
              <Skeleton width="85%" height={12} />
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
