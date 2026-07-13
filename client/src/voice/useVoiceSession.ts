import { useCallback, useEffect, useReducer, useRef } from 'react'
import { speak, stopSpeaking } from '../utils/tts'
import { combineAbortSignals, createTimeoutSignal, isTimeoutAbort } from '../utils/withTimeout'
import { getVoiceAdapter } from './voiceAdapter'
import type { VoicePhase } from './types'

const RESULT_RESTART_DELAY_MS = 100
const ERROR_RESTART_DELAY_MS = 500
const MAX_EMPTY_RECOGNITIONS = 3
const COMMAND_TIMEOUT_MS = 60_000

interface State {
  phase: VoicePhase
  error: string | null
  partialText: string
  autoVoiceMode: boolean
}

type Action =
  | { type: 'SET_AUTO'; value: boolean }
  | { type: 'SET_PHASE'; phase: VoicePhase }
  | { type: 'SET_PARTIAL'; text: string }
  | { type: 'SET_ERROR'; message: string }
  | { type: 'CLEAR_ERROR' }

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'SET_AUTO':
      return { ...state, autoVoiceMode: action.value }
    case 'SET_PHASE':
      return { ...state, phase: action.phase }
    case 'SET_PARTIAL':
      return { ...state, partialText: action.text }
    case 'SET_ERROR':
      return { ...state, phase: 'error', error: action.message }
    case 'CLEAR_ERROR':
      return { ...state, phase: 'idle', error: null }
    default:
      return state
  }
}

interface Options {
  onSend: (text: string, signal?: AbortSignal) => Promise<string>
  onInputPreview?: (text: string) => void
}

export function useVoiceSession({ onSend, onInputPreview }: Options) {
  const [state, dispatch] = useReducer(reducer, {
    phase: 'idle',
    error: null,
    partialText: '',
    autoVoiceMode: true,
  })

  const adapterRef = useRef(getVoiceAdapter())
  const sessionActiveRef = useRef(false)
  const phaseRef = useRef<VoicePhase>('idle')
  const autoVoiceRef = useRef(true)
  const onSendRef = useRef(onSend)
  const onInputPreviewRef = useRef(onInputPreview)
  const abortControllerRef = useRef<AbortController | null>(null)
  const emptyRecognitionCountRef = useRef(0)
  const turnIdRef = useRef(0)

  useEffect(() => {
    phaseRef.current = state.phase
  }, [state.phase])

  useEffect(() => {
    autoVoiceRef.current = state.autoVoiceMode
  }, [state.autoVoiceMode])

  useEffect(() => {
    onSendRef.current = onSend
  }, [onSend])

  useEffect(() => {
    onInputPreviewRef.current = onInputPreview
  }, [onInputPreview])

  const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

  const isTurnActive = (turnId: number) =>
    sessionActiveRef.current && turnIdRef.current === turnId

  const startListeningInternalRef = useRef<() => Promise<void>>(async () => {})

  const resumeAfterSpeaking = async () => {
    dispatch({ type: 'SET_PHASE', phase: 'idle' })
    if (autoVoiceRef.current && sessionActiveRef.current) {
      await delay(RESULT_RESTART_DELAY_MS)
      if (sessionActiveRef.current) await startListeningInternalRef.current()
    }
  }

  const startListeningInternal = useCallback(async () => {
    if (!sessionActiveRef.current) return
    if (phaseRef.current === 'thinking' || phaseRef.current === 'speaking') return

    await adapterRef.current.stop()

    const supported = await adapterRef.current.isSupported()
    if (!supported) {
      dispatch({ type: 'SET_ERROR', message: '当前环境不支持语音识别' })
      sessionActiveRef.current = false
      return
    }

    dispatch({ type: 'CLEAR_ERROR' })
    dispatch({ type: 'SET_PHASE', phase: 'listening' })
    emptyRecognitionCountRef.current = 0

    await adapterRef.current.start({
      onPartial: (partial) => {
        dispatch({ type: 'SET_PARTIAL', text: partial })
        onInputPreviewRef.current?.(partial)
      },
      onFinal: (finalText) => {
        const turnId = turnIdRef.current
        void (async () => {
          if (!isTurnActive(turnId)) return

          const trimmed = finalText.trim()
          dispatch({ type: 'SET_PARTIAL', text: trimmed })
          onInputPreviewRef.current?.(trimmed)

          if (!trimmed) {
            emptyRecognitionCountRef.current += 1
            if (emptyRecognitionCountRef.current >= MAX_EMPTY_RECOGNITIONS) {
              dispatch({
                type: 'SET_ERROR',
                message: '未识别到语音，请检查麦克风权限或靠近手机说话',
              })
              sessionActiveRef.current = false
              return
            }
            if (autoVoiceRef.current && isTurnActive(turnId)) {
              await delay(RESULT_RESTART_DELAY_MS)
              if (isTurnActive(turnId)) await startListeningInternal()
            } else {
              dispatch({ type: 'SET_PHASE', phase: 'idle' })
            }
            return
          }

          emptyRecognitionCountRef.current = 0

          await adapterRef.current.stop()
          if (!isTurnActive(turnId)) return

          dispatch({ type: 'SET_PHASE', phase: 'thinking' })

          abortControllerRef.current?.abort()
          abortControllerRef.current = new AbortController()
          const userSignal = abortControllerRef.current.signal
          const { signal: timeoutSignal, clear: clearTimeoutTimer } = createTimeoutSignal(COMMAND_TIMEOUT_MS)
          const signal = combineAbortSignals([userSignal, timeoutSignal])

          try {
            const reply = await onSendRef.current(trimmed, signal)
            clearTimeoutTimer()
            if (!isTurnActive(turnId) || userSignal.aborted) return

            dispatch({ type: 'SET_PHASE', phase: 'speaking' })
            dispatch({ type: 'SET_PARTIAL', text: '' })
            onInputPreviewRef.current?.('')

            try {
              await speak(reply)
            } finally {
              clearTimeoutTimer()
              if (!isTurnActive(turnId) || userSignal.aborted) {
                dispatch({ type: 'SET_PHASE', phase: 'idle' })
                return
              }
              await resumeAfterSpeaking()
            }
          } catch (err) {
            clearTimeoutTimer()
            if (userSignal.aborted && !isTimeoutAbort(signal)) {
              dispatch({ type: 'SET_PHASE', phase: 'idle' })
              return
            }
            const message =
              isTimeoutAbort(signal) || isTimeoutAbort(userSignal)
                ? '处理超时，请重试'
                : err instanceof Error
                  ? err.message
                  : '语音指令失败，请重试'
            dispatch({ type: 'SET_ERROR', message })
            sessionActiveRef.current = false
          }
        })()
      },
      onError: (message) => {
        dispatch({ type: 'SET_ERROR', message })
        if (
          !autoVoiceRef.current ||
          /权限被拒绝|不支持|不可用|已取消/.test(message)
        ) {
          sessionActiveRef.current = false
          return
        }

        const turnId = turnIdRef.current
        void (async () => {
          await delay(ERROR_RESTART_DELAY_MS)
          if (isTurnActive(turnId)) await startListeningInternalRef.current()
        })()
      },
    })
  }, [])

  startListeningInternalRef.current = startListeningInternal

  const stopSession = useCallback(async () => {
    turnIdRef.current += 1
    sessionActiveRef.current = false
    abortControllerRef.current?.abort()
    abortControllerRef.current = null
    stopSpeaking()
    await adapterRef.current.stop()
    dispatch({ type: 'SET_PHASE', phase: 'idle' })
    dispatch({ type: 'SET_PARTIAL', text: '' })
    onInputPreviewRef.current?.('')
  }, [])

  const start = useCallback(async () => {
    if (phaseRef.current === 'thinking' || phaseRef.current === 'speaking') return

    turnIdRef.current += 1
    sessionActiveRef.current = true
    stopSpeaking()
    await adapterRef.current.stop()
    await startListeningInternal()
  }, [startListeningInternal])

  const stop = useCallback(async () => {
    await stopSession()
  }, [stopSession])

  const skipSpeakingAndContinue = useCallback(async () => {
    if (phaseRef.current !== 'speaking') {
      stopSpeaking()
      return
    }

    stopSpeaking()
    dispatch({ type: 'SET_PHASE', phase: 'idle' })

    if (!sessionActiveRef.current || !autoVoiceRef.current) return

    await delay(RESULT_RESTART_DELAY_MS)
    if (sessionActiveRef.current) await startListeningInternal()
  }, [startListeningInternal])

  const toggleAutoVoiceMode = useCallback((value: boolean) => {
    dispatch({ type: 'SET_AUTO', value })
  }, [])

  const dismissError = useCallback(() => {
    dispatch({ type: 'CLEAR_ERROR' })
  }, [])

  return {
    phase: state.phase,
    error: state.error,
    partialText: state.partialText,
    autoVoiceMode: state.autoVoiceMode,
    isBusy: state.phase === 'thinking' || state.phase === 'speaking',
    isListening: state.phase === 'listening',
    start,
    stop,
    skipSpeakingAndContinue,
    toggleAutoVoiceMode,
    dismissError,
  }
}
