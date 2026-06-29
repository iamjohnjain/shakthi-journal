import { LayoutDashboard, ToggleLeft, ToggleRight, RotateCcw, Eye, Minimize2 } from 'lucide-react'
import { CARD_REGISTRY, useDashboardCards } from '../hooks/useDashboardCards'
import './DashboardSettings.css'

const GROUPS = Array.from(new Set(CARD_REGISTRY.map(c => c.group)))

export default function DashboardSettings() {
  const { isVisible, toggle, setAll, resetToDefaults, setMinimal } = useDashboardCards()

  return (
    <div className="ds-page">
      <header className="page-header">
        <div>
          <h1 className="page-title">Dashboard Layout</h1>
          <p className="page-subtitle">Choose which cards appear on your dashboard.</p>
        </div>
        <LayoutDashboard size={28} style={{ color: 'var(--blue)', flexShrink: 0, marginTop: 4 }} />
      </header>

      {/* Preset buttons */}
      <div className="ds-presets">
        <button className="ds-preset-btn" onClick={() => resetToDefaults()}>
          <RotateCcw size={14} />
          Reset to Recommended
        </button>
        <button className="ds-preset-btn" onClick={() => setAll(true)}>
          <Eye size={14} />
          Show All
        </button>
        <button className="ds-preset-btn" onClick={() => setMinimal()}>
          <Minimize2 size={14} />
          Minimal Mode
        </button>
      </div>

      {/* Cards by group */}
      {GROUPS.map(group => (
        <div key={group} className="ds-group">
          <h2 className="ds-group-title">{group}</h2>
          <div className="ds-card-list">
            {CARD_REGISTRY.filter(c => c.group === group).map(card => {
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
      ))}

      <p className="ds-footer-note">
        Changes save instantly to this device. Data is never affected by layout changes.
      </p>
    </div>
  )
}
