import './Avatar.css'

export interface AnimalAvatar {
  id: string
  emoji: string
  label: string
  fg: string   // text/emoji color
  bg: string   // background color
}

export const ANIMAL_AVATARS: AnimalAvatar[] = [
  { id: 'lion',  emoji: '🦁', label: 'Lion',  fg: '#F5A623', bg: '#2C1A05' },
  { id: 'tiger', emoji: '🐯', label: 'Tiger', fg: '#F97316', bg: '#2C1105' },
  { id: 'bull',  emoji: '🐂', label: 'Bull',  fg: '#A78BFA', bg: '#1A1035' },
  { id: 'wolf',  emoji: '🐺', label: 'Wolf',  fg: '#94A3B8', bg: '#0F172A' },
  { id: 'eagle', emoji: '🦅', label: 'Eagle', fg: '#38BDF8', bg: '#082340' },
  { id: 'bear',  emoji: '🐻', label: 'Bear',  fg: '#34D399', bg: '#052E16' },
]

export function getAvatar(avatarId?: string): AnimalAvatar | null {
  return ANIMAL_AVATARS.find(a => a.id === avatarId) ?? null
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

interface AvatarDisplayProps {
  name?: string
  avatarId?: string
  photoDataUrl?: string
  size?: 'sm' | 'md' | 'lg'
}

/** Renders: custom photo > animal emoji > initials > fallback letter */
export function AvatarDisplay({ name, avatarId, photoDataUrl, size = 'md' }: AvatarDisplayProps) {
  const animal = getAvatar(avatarId)

  if (photoDataUrl) {
    return (
      <div className={`avatar avatar--${size} avatar--photo`}>
        <img src={photoDataUrl} alt={name ?? 'Profile'} className="avatar-img" />
      </div>
    )
  }

  if (animal) {
    return (
      <div
        className={`avatar avatar--${size} avatar--animal`}
        style={{ background: animal.bg, color: animal.fg }}
        title={animal.label}
      >
        <span className="avatar-emoji">{animal.emoji}</span>
      </div>
    )
  }

  const letter = name ? initials(name) : '?'
  return (
    <div className={`avatar avatar--${size} avatar--initials`}>
      <span className="avatar-letter">{letter}</span>
    </div>
  )
}

/** Grid picker shown in profile edit modal and onboarding */
export function AvatarPicker({
  selectedId,
  onSelect,
}: {
  selectedId?: string
  onSelect: (id: string | undefined) => void
}) {
  return (
    <div className="avatar-picker">
      <div className="avatar-picker-label">Choose an avatar</div>
      <div className="avatar-picker-grid">
        {ANIMAL_AVATARS.map(a => (
          <button
            key={a.id}
            type="button"
            className={`avatar-option ${selectedId === a.id ? 'avatar-option--selected' : ''}`}
            style={{ background: a.bg, borderColor: selectedId === a.id ? a.fg : 'transparent' }}
            onClick={() => onSelect(selectedId === a.id ? undefined : a.id)}
            title={a.label}
          >
            <span className="avatar-option-emoji">{a.emoji}</span>
            <span className="avatar-option-label" style={{ color: a.fg }}>{a.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
