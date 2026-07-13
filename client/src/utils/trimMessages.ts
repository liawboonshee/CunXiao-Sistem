import type { ChatMessage } from '../types/chat'

/** 保留最近 maxMessages 条本地语音操作记录。 */
export function trimMessages(messages: ChatMessage[], maxMessages = 20): ChatMessage[] {
  if (messages.length <= maxMessages) return messages
  return messages.slice(-maxMessages)
}
