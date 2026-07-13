export type VoicePhase = 'idle' | 'listening' | 'thinking' | 'speaking' | 'error'

export interface VoiceListenHandlers {
  onPartial?: (text: string) => void
  onFinal: (text: string) => void
  onError: (message: string) => void
}

export interface VoiceAdapter {
  isSupported: () => Promise<boolean>
  requestPermission: () => Promise<boolean>
  start: (handlers: VoiceListenHandlers) => Promise<void>
  stop: () => Promise<void>
}

export const PHASE_LABELS: Record<VoicePhase, string> = {
  idle: '待命',
  listening: '聆听中',
  thinking: '处理中',
  speaking: '播报中',
  error: '出错',
}
