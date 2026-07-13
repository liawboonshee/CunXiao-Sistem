import { Capacitor } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'
import type { ChatMessage } from '../types/chat'
import { trimMessages } from './trimMessages'

const STORAGE_KEY = 'free_inventory_voice_messages'

function isChatMessage(value: unknown): value is ChatMessage {
  if (!value || typeof value !== 'object') return false
  const item = value as ChatMessage
  return (
    (item.role === 'user' || item.role === 'assistant' || item.role === 'system') &&
    typeof item.content === 'string' &&
    item.content.trim().length > 0
  )
}

function parseStoredMessages(raw: string | null): ChatMessage[] {
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return trimMessages(parsed.filter(isChatMessage))
  } catch {
    return []
  }
}

async function readRaw(): Promise<string | null> {
  if (Capacitor.isNativePlatform()) {
    const { value } = await Preferences.get({ key: STORAGE_KEY })
    return value
  }

  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

async function writeRaw(serialized: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    await Preferences.set({ key: STORAGE_KEY, value: serialized })
  }

  try {
    localStorage.setItem(STORAGE_KEY, serialized)
  } catch {
    // 浏览器隐私模式等场景下 localStorage 可能不可用
  }
}

async function removeRaw(): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    await Preferences.remove({ key: STORAGE_KEY })
  }

  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
}

export async function loadMessages(): Promise<ChatMessage[]> {
  return parseStoredMessages(await readRaw())
}

export async function saveMessages(messages: ChatMessage[]): Promise<void> {
  const trimmed = trimMessages(messages)
  await writeRaw(JSON.stringify(trimmed))
}

export async function clearMessages(): Promise<void> {
  await removeRaw()
}
