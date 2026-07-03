import { HugeIcon } from "@/components/ui/huge-icon";
import { IconBookmark, IconFile, IconLoader } from "@/components/ui/icons";
;

type DashboardRouteSkeletonProps = {
  variant: "bookmarks" | "canvas";
};

function SkeletonPreviewStatus({ label }: { label: string }) {
  return (
    <div className="skeleton-preview-status">
      <HugeIcon icon={IconLoader} size={18} />
      <span>{label}</span>
    </div>
  );
}

export function BookmarkGridSkeleton() {
  return (
    <div className="dashboard-route-skeleton dashboard-home" role="status" aria-live="polite">
      <section className="dashboard-skeleton-heading" aria-label="Loading bookmarks">
        <div className="dashboard-skeleton-heading-copy">
          <div className="skeleton-line skeleton-line-kicker" />
          <div className="skeleton-line skeleton-line-title" />
        </div>
        <div className="dashboard-skeleton-actions">
          <div className="skeleton-button" />
          <div className="skeleton-button skeleton-button-secondary" />
        </div>
      </section>

      <div className="bm-grid view-moodboard dashboard-skeleton-grid">
        {Array.from({ length: 8 }).map((_, index) => (
          <article
            key={index}
            className="bm-card moodboard-card dashboard-skeleton-card"
            aria-hidden="true"
          >
            <div className="moodboard-shot pending-shot">
              <div className="pending-browser-bar">
                <span />
                <span />
                <span />
                <strong />
              </div>
              <div className="pending-skeleton">
                <div className="pending-line pending-line-sm" />
                <div className="pending-hero" />
                <div className="pending-line" />
                <div className="pending-line pending-line-mid" />
                <div className="pending-grid">
                  <span />
                  <span />
                  <span />
                  <span />
                </div>
              </div>
              {index === 0 && <SkeletonPreviewStatus label="Loading bookmarks..." />}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

export function CanvasBoardSkeleton() {
  return (
    <div className="dashboard-route-skeleton canvas-board-skeleton" role="status" aria-live="polite">
      <div className="canvas-loading-pill canvas-loading-pill-floating">
        <HugeIcon icon={IconLoader} size={18} />
        <span>Loading canvas...</span>
      </div>
    </div>
  );
}

export function DashboardRouteSkeleton({ variant }: DashboardRouteSkeletonProps) {
  if (variant === "canvas") return <CanvasBoardSkeleton />;

  return <BookmarkGridSkeleton />;
}

export function DashboardRouteSkeletonIcon({ variant }: DashboardRouteSkeletonProps) {
  return variant === "canvas" ? <HugeIcon icon={IconFile} size={18} /> : <HugeIcon icon={IconBookmark} size={18} />;
}
