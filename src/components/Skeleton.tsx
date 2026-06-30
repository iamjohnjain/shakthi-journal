import './Skeleton.css'

export function SkeletonCard({ wide = false, height = 96 }: { wide?: boolean; height?: number }) {
  return (
    <div className={`skeleton-card ${wide ? 'skeleton-card--wide' : ''}`} style={{ minHeight: height }}>
      <div className="skeleton-line skeleton-line--xs" />
      <div className="skeleton-line skeleton-line--lg" />
      <div className="skeleton-line skeleton-line--md" />
    </div>
  )
}

export function SkeletonSection() {
  return (
    <section className="skeleton-section">
      <div className="skeleton-line skeleton-line--xs" style={{ width: 80 }} />
      <div className="skeleton-grid">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    </section>
  )
}

export function SkeletonHero() {
  return (
    <div className="skeleton-hero">
      <div className="skeleton-line skeleton-line--xs" style={{ width: 60 }} />
      <div className="skeleton-line skeleton-line--xl" style={{ width: '70%' }} />
      <div className="skeleton-chips">
        <div className="skeleton-chip" />
        <div className="skeleton-chip" />
        <div className="skeleton-chip" />
      </div>
    </div>
  )
}
