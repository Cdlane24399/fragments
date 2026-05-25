import { Message } from './messages'
import { FragmentSchema } from './schema'
import { ExecutionResult } from './types'
import { DeepPartial } from 'ai'
import { nanoid } from 'nanoid'

export interface ChatSession {
  id: string
  title: string
  messages: Message[]
  timestamp: number
  fragment?: DeepPartial<FragmentSchema> | undefined
  result?: ExecutionResult | undefined
}

export const CHATS_KEY = 'fragments-chats'

function isBrowser() {
  return typeof window !== 'undefined'
}

export function saveChat(session: ChatSession) {
  if (!isBrowser()) return
  const chats = loadChats()
  const index = chats.findIndex((c) => c.id === session.id)
  if (index >= 0) {
    chats[index] = session
  } else {
    chats.push(session)
  }
  localStorage.setItem(CHATS_KEY, JSON.stringify(chats))
}

export function loadChats(): ChatSession[] {
  if (!isBrowser()) return []
  try {
    const raw = localStorage.getItem(CHATS_KEY)
    if (!raw) return []
    return JSON.parse(raw) as ChatSession[]
  } catch {
    return []
  }
}

export function deleteChat(id: string) {
  if (!isBrowser()) return
  const chats = loadChats()
  const filtered = chats.filter((c) => c.id !== id)
  localStorage.setItem(CHATS_KEY, JSON.stringify(filtered))
}

export function generateChatTitle(messages: Message[]): string {
  const userMessage = messages.find((m) => m.role === 'user')
  if (!userMessage) return 'New Chat'
  const textContent = userMessage.content.find((c) => c.type === 'text')
  if (!textContent || textContent.type !== 'text') return 'New Chat'
  const title = textContent.text.trim()
  return title.length > 40 ? title.slice(0, 40) + '...' : title || 'New Chat'
}

export function createChatId() {
  return nanoid()
}