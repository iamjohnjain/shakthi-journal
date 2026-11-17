import { getDB } from './index'
import type { CoachChatMessage } from './index'

export async function saveChatMessage(message: CoachChatMessage): Promise<void> {
  const db = await getDB()
  await db.put('coach_chat', message)
}

/** Oldest-first (conversation order), most recent `limit` messages. */
export async function getChatHistory(limit = 200): Promise<CoachChatMessage[]> {
  const db = await getDB()
  const all = await db.getAll('coach_chat')
  return all
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    .slice(-limit)
}

export async function clearChatHistory(): Promise<void> {
  const db = await getDB()
  await db.clear('coach_chat')
}
