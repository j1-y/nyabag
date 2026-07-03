export default function FolderLoading() {
  return (
    <div className="folder-detail-page">
      <div className="folder-breadcrumbs folder-breadcrumbs-skeleton" aria-hidden="true">
        <span className="skeleton-text" style={{ width: 120 }} />
        <span className="skeleton-text" style={{ width: 80 }} />
      </div>
      <div className="folder-detail-header" aria-hidden="true">
        <div className="skeleton-text" style={{ width: 200, height: 28, marginBottom: 8 }} />
        <div className="skeleton-text" style={{ width: 140, height: 16 }} />
      </div>
    </div>
  );
}
