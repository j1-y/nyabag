export default function BookmarkDetailLoading() {
  return (
    <div className="bookmark-detail-page">
      <main className="bookmark-detail-shell bookmark-detail-skeleton" role="status" aria-live="polite">
        <section className="bookmark-detail-info">
          <div className="skeleton-line skeleton-line-kicker" />
          <div>
            <div className="skeleton-line skeleton-line-kicker" />
            <div className="skeleton-line skeleton-line-title" />
          </div>
          <div className="detail-summary-card">
            <div className="skeleton-line" />
            <div className="skeleton-line" />
            <div className="skeleton-line skeleton-line-kicker" />
          </div>
          <div className="ai-design-read">
            <div className="skeleton-line" />
            <div className="skeleton-line skeleton-line-title" />
          </div>
          <div className="detail-table">
            <div><span /><strong /></div>
            <div><span /><strong /></div>
            <div><span /><strong /></div>
          </div>
        </section>

        <section className="bookmark-detail-preview">
          <div className="browser-frame bookmark-browser-frame">
            <div className="browser-topbar">
              <span />
              <span />
              <span />
              <strong />
            </div>
            <div className="bookmark-detail-skeleton__shot" />
          </div>
        </section>
      </main>
    </div>
  );
}
