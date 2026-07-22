import { UnifiedSelect } from "./UnifiedSelect";

export interface CategoryOption {
  value: string;
  label: string;
}

export function RefreshButton({ loading, onClick }: { loading: boolean; onClick: () => void }) {
  return (
    <button
      className="store-icon-btn"
      type="button"
      title="刷新商店"
      aria-label="刷新商店"
      disabled={loading}
      onClick={onClick}
    >
      <svg className={loading ? "spinning" : ""} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 11a8 8 0 1 0-2.34 5.66" />
        <path d="M20 4v7h-7" />
      </svg>
    </button>
  );
}

export function CategorySelect({
  value,
  options,
  onChange,
  allLabel = "全部分类",
}: {
  value: string;
  options: CategoryOption[];
  onChange: (value: string) => void;
  allLabel?: string;
}) {
  return (
    <UnifiedSelect
      value={value}
      options={[{ value: "", label: allLabel }, ...options]}
      onChange={onChange}
      placeholder={allLabel}
      ariaLabel="分类筛选"
      icon={
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M4 7h16M7 12h10M10 17h4" />
          </svg>
      }
    />
  );
}

export function StoreSkeleton({ pet = false }: { pet?: boolean }) {
  return (
    <div className="grid skeleton-grid" aria-label="正在加载商店内容" aria-busy="true">
      {Array.from({ length: 6 }, (_, index) => (
        <div className="card skeleton-card" key={index}>
          <div className={`skeleton-cover ${pet ? "pet" : ""}`} />
          <div className="meta">
            <div className="skeleton-line title" />
            <div className="skeleton-line text" />
            <div className="skeleton-line button" />
          </div>
        </div>
      ))}
    </div>
  );
}
