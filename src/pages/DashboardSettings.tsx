import { LayoutDashboard, ToggleLeft, ToggleRight, RotateCcw, Eye, Minimize2, ChevronUp, ChevronDown, Pin } from 'lucide-react'
import { CARD_REGISTRY, REORDERABLE_IDS, useDashboardCards } from '../hooks/useDashboardCards'
import './DashboardSettings.css'

const GROUPS = Array.from(new Set(CARD_REGISTRY.map(c => c.group)))

export default function DashboardSettings() {
  const { isVisible, toggle, setAll, resetToDefaults, setMinimal, sectionOrder, moveUp, moveDown, pinToTop } = useDashboardCards()

  const orderedReorderables = REORDERABLE_IDS
    .slice()
    .sort((a, b) => sectionOrder.indexOf(a) - sectionOrder.indexOf(b))

  return (
    <div className="ds-page">
      <header className="page-header">
        <div>
          <h1 className="page-title">Dashboard Layout</h1>
          <p className="page-subtitle">Choose which cards appear and in what order.</p>
        </div>
        <LayoutDashboard size={28} style={{ color: 'var(--blue)', flexShrink: 0, marginTop: 4 }} />
      </header>

      {/* Preset buttons */}
      <div className="ds-presets">
        <button className="ds-preset-btn" onClick={() => resetToDefaults()}>
          <RotateCcw size={14} /> Reset to Recommended
        </button>
        <button className="ds-preset-btn" onClick={() => setAll(true)}>
          <Eye size={14} /> Show All
        </button>
        <button className="ds-preset-btn" onClick={() => setMinimal()}>
          <Minimize2 size={14} /> Minimal Mode
        </button>
      </div>

      {/* Reorderable sections */}
      <div className="ds-group">
        <h2 className="ds-group-title">Section Order</h2>
        <p className="ds-group-sub">Drag or tap arrows to reorder sections on your dashboard.</p>
        <div className="ds-card-list">
          {orderedReorderables.map((id, i) => {
            const card = CARD_REGISTRY.find(c => c.id === id)
            if (!card) return null
            const on = isVisible(id)
            return (
              <div key={id} className={`ds-card-row ds-card-row--order ${!on ? 'ds-card-row--hidden' : ''}`}>
                <div className="ds-order-controls">
                  <button
                    className="ds-order-btn"
                    onClick={() => moveUp(id)}
                    disabled={i === 0}
                    aria-label={`Move ${card.label} up`}
                  >
                    <ChevronUp size={14} />
                  </button>
                  <button
                    className="ds-order-btn"
                    onClick={() => moveDown(id)}
                    disabled={i === orderedReorderables.length - 1}
                    aria-label={`Move ${card.label} down`}
                  >
                    <ChevronDown size={14} />
                  </button>
                  {i > 0 && (
                    <button
                      className="ds-order-btn"
                      onClick={() => pinToTop(id)}
                      aria-label={`Pin ${card.label} to top`}
                      title="Pin to top"
                    >
                      <Pin size={12} />
                    </button>
                  )}
                </div>
                <div className="ds-card-info">
                  <span className="ds-card-label">{card.label}</span>
                  <span className="ds-card-desc">{card.description}</span>
                </div>
                <button
                  className={`ds-toggle ${on ? 'ds-toggle--on' : ''}`}
                  onClick={() => toggle(id)}
                  aria-label={`${on ? 'Hide' : 'Show'} ${card.label}`}
                >
                  {on ? <ToggleRight size={30} /> : <ToggleLeft size={30} />}
                </button>
              </div>
            )
          })}
        </div>
      </div>

      {/* Non-reorderable cards by group */}
      {GROUPS.map(group => {
        const groupCards = CARD_REGISTRY.filter(c => c.group === group && !REORDERABLE_IDS.includes(c.id))
        if (groupCards.length === 0) return null
        return (
          <div key={group} className="ds-group">
            <h2 className="ds-group-title">{group}</h2>
            <div className="ds-card-list">
              {groupCards.map(card => {
                const on = isVisible(card.id)
                return (
                  <div key={card.id} className="ds-card-row">
                    <div className="ds-card-info">
                      <span className="ds-card-label">{card.label}</span>
                      <span className="ds-card-desc">{card.description}</span>
                    </div>
                    <button
                      className={`ds-toggle ${on ? 'ds-toggle--on' : ''}`}
                      onClick={() => toggle(card.id)}
                      aria-label={`${on ? 'Hide' : 'Show'} ${card.label}`}
                    >
                      {on ? <ToggleRight size={30} /> : <ToggleLeft size={30} />}
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}

      <p className="ds-footer-note">
        Changes save instantly and sync across devices when signed in. Data is never affected by layout changes.
      </p>
    </div>
  )
}
