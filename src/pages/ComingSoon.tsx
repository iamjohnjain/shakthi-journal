import type { LucideIcon } from 'lucide-react'
import './ComingSoon.css'

interface Props {
  icon: LucideIcon
  title: string
  description: string
  accentColor?: string
}

export default function ComingSoon({ icon: Icon, title, description, accentColor = 'var(--blue)' }: Props) {
  return (
    <div className="coming-soon">
      <div className="cs-icon-wrap" style={{ background: `color-mix(in srgb, ${accentColor} 14%, transparent)`, borderColor: `color-mix(in srgb, ${accentColor} 22%, transparent)` }}>
        <Icon size={28} style={{ color: accentColor }} />
      </div>
      <h1 className="cs-title">{title}</h1>
      <p className="cs-description">{description}</p>
      <div className="cs-badge">Building next</div>
    </div>
  )
}
