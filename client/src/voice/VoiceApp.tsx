import { useCallback, useEffect, useRef, useState } from 'react'

import type { ChatMessage } from '../types/chat'
import { runInventoryTool } from '../inventory/AITools'
import { ChatMessageBubble } from '../components/ChatMessage'
import { InputBar } from '../components/InputBar'
import { loadMessages, saveMessages } from '../utils/chatStorage'
import { trimMessages } from '../utils/trimMessages'
import { speak, stopSpeaking } from '../utils/tts'
import { useVoiceSession } from './useVoiceSession'
import { PHASE_LABELS } from './types'

const SAVE_DEBOUNCE_MS = 300
const AUTO_START_DELAY_MS = 650
const HELP_REPLY =
  '这是免费的本地库存语音。你可以说：“进货10克，成本60”、“卖给阿明5克，收300”、“现在库存多少”或“今天利润多少”。'

function answerLocally(text: string): string {
  return runInventoryTool(text) ?? HELP_REPLY
}

export default function VoiceApp() {
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [historyReady, setHistoryReady] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)
  const messagesRef = useRef<ChatMessage[]>([])
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const autoStartedRef = useRef(false)

  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  useEffect(() => {
    void loadMessages().then((stored) => {
      setMessages(stored)
      setHistoryReady(true)
    })
  }, [])

  useEffect(() => {
    if (!historyReady) return

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null
      void saveMessages(messages)
    }, SAVE_DEBOUNCE_MS)

    return () => {
      if (!saveTimerRef.current) return
      clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
      void saveMessages(messages)
    }
  }, [messages, historyReady])

  const handleVoiceSend = useCallback(async (text: string) => {
    const userMessage: ChatMessage = { role: 'user', content: text }
    const nextMessages = trimMessages([...messagesRef.current, userMessage])
    const reply = answerLocally(text)
    const completedMessages = trimMessages([
      ...nextMessages,
      { role: 'assistant', content: reply },
    ])

    setMessages(completedMessages)
    return reply
  }, [])

  const voice = useVoiceSession({
    onSend: handleVoiceSend,
    onInputPreview: setInput,
  })

  useEffect(() => {
    if (!historyReady || autoStartedRef.current) return

    const timer = setTimeout(() => {
      if (autoStartedRef.current) return
      autoStartedRef.current = true
      void voice.start()
    }, AUTO_START_DELAY_MS)

    return () => clearTimeout(timer)
  }, [historyReady, voice.start])

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, voice.phase])

  const sendText = async () => {
    const text = input.trim()
    if (!text || voice.isBusy) return

    stopSpeaking()
    await voice.stop()

    const userMessage: ChatMessage = { role: 'user', content: text }
    const nextMessages = trimMessages([...messagesRef.current, userMessage])
    const reply = answerLocally(text)
    const completedMessages = trimMessages([
      ...nextMessages,
      { role: 'assistant', content: reply },
    ])

    setMessages(completedMessages)
    setInput('')
    void speak(reply)
  }

  const handleStopSpeaking = () => {
    if (voice.autoVoiceMode && voice.phase === 'speaking') {
      void voice.skipSpeakingAndContinue()
      return
    }
    stopSpeaking()
  }

  const handleClearHistory = () => {
    setMessages([])
    void saveMessages([])
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-row">
          <div>
            <h1>🎙️ 免费语音记账</h1>
            <p>手机语音识别 · 本地解析 · 不用 AI Key</p>
          </div>
          <div className="header-actions">
            <button type="button" className="settings-button" onClick={handleClearHistory}>
              清除对话
            </button>
            <span className={`phase-pill phase-pill-${voice.phase}`}>
              {PHASE_LABELS[voice.phase]}
            </span>
          </div>
        </div>
      </header>

      <main className="chat-area" ref={listRef}>
        {messages.length === 0 && !voice.isBusy && (
          <div className="empty-state">
            <p>开启后会自动准备聆听，也可点 🎤 手动开始。</p>
            <p className="empty-hint">
              说“进货10克成本60”或“卖给阿明5克收300”，会直接写入库存记录。
            </p>
          </div>
        )}

        {messages.map((message, index) => (
          <ChatMessageBubble key={`${message.role}-${index}`} message={message} />
        ))}

        {voice.phase === 'thinking' && (
          <div className="loading-row">
            <span className="loading-dot" />
            正在处理库存指令...
          </div>
        )}
      </main>

      {voice.error && (
        <div className="error-banner">
          {voice.error}
          <button type="button" className="error-dismiss" onClick={voice.dismissError}>
            关闭
          </button>
        </div>
      )}

      <InputBar
        input={input}
        loading={voice.isBusy}
        listening={voice.isListening}
        autoVoiceMode={voice.autoVoiceMode}
        phase={voice.phase}
        onInputChange={setInput}
        onSend={sendText}
        onVoiceStart={voice.start}
        onVoiceStop={voice.stop}
        onAutoVoiceToggle={voice.toggleAutoVoiceMode}
        onStopSpeaking={handleStopSpeaking}
      />
    </div>
  )
}
