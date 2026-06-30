import type { Achievement } from '../db/index'
import './AchievementCard.css'

interface Props {
  achievement: Achievement
}

function timeAgo(isoStr: string): string {
  const diff = Date.now() - new Date(isoStr).getTime()
  const days = Math.floor(diff / 86_400_000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days} days ago`
  if (days < 30) return `${Math.floor(days / 7)} week${Math.floor(days / 7) > 1 ? 's' : ''} ago`
  return `${Math.floor(days / 30)} month${Math.floor(days / 30) > 1 ? 's' : ''} ago`
}

export function AchievementCard({ achievement }: Props) {
  return (
    <article className="achievement-card" aria-label={`Achievement: ${achievement.title}`}>
      <span className="ach-emoji" aria-hidden="true">{achievement.emoji}</span>
      <div className="ach-body">
        <span className="ach-title">{achievement.title}</span>
        <span className="ach-desc">{achievement.description}</span>
      </div>
      <span className="ach-when">{timeAgo(achievement.unlockedAt)}</span>
    </article>
  )
}

export function AchievementRow({ achievements }: { achievements: Achievement[] }) {
  if (achievements.length === 0) return null
  return (
    <section className="achievement-row" aria-label="Recent achievements">
      <h2 className="ach-row-title">ACHIEVEMENTS</h2>
      <div className="ach-row-list">
        {achievements.map(a => (
          <AchievementCard key={a.id} achievement={a} />
        ))}
      </div>
    </section>
  )
}
