import { Skeleton } from '../../components/ui';

export default function Loading() {
  return (
    <main className="ui-skeleton-screen" aria-busy="true">
      <span className="sr-only" role="status">Loading forms…</span>
      <div className="ui-page-skeleton">
        <div className="ui-skel-head">
          <Skeleton width="120px" height={12} />
          <Skeleton width="min(440px, 76%)" height={40} />
          <Skeleton width="min(520px, 86%)" height={16} />
        </div>
        <div className="ui-skel-grid">
          {Array.from({ length: 6 }).map((_, i) => (
            <div className="ui-skel-card" key={i}>
              <Skeleton width="40px" height={40} radius="var(--radius-md)" />
              <Skeleton width="75%" height={18} />
              <Skeleton width="100%" height={12} />
              <Skeleton width="60%" height={12} />
              <Skeleton width="110px" height={30} radius="var(--radius-sm)" />
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
