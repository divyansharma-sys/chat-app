import React, { useState, useEffect, useRef } from 'react'
import { Mic, Trash2, Send, Square, Play, Pause } from 'lucide-react'

export default function VoiceRecorder({ onSendAudio, onCancel, onError }) {
  const [isRecording, setIsRecording] = useState(false)
  const [recordingSeconds, setRecordingSeconds] = useState(0)
  const [audioBlob, setAudioBlob] = useState(null)
  const [audioUrl, setAudioUrl] = useState(null)
  const [isPlayingPreview, setIsPlayingPreview] = useState(false)

  const mediaRecorderRef = useRef(null)
  const audioChunksRef = useRef([])
  const timerIntervalRef = useRef(null)
  const audioPreviewRef = useRef(null)
  const startTimeRef = useRef(null)
  const durationRef = useRef(0)

  useEffect(() => {
    startRecording()
    return () => {
      cleanup()
    }
  }, [])

  const cleanup = () => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current)
      timerIntervalRef.current = null
    }
    startTimeRef.current = null
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      try {
        mediaRecorderRef.current.stop()
      } catch (e) {}
    }
    if (mediaRecorderRef.current?.stream) {
      mediaRecorderRef.current.stream.getTracks().forEach(t => t.stop())
    }
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl)
    }
  }

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      audioChunksRef.current = []

      // Pick supported mimeType
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : (MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : '')

      const options = mimeType ? { mimeType } : undefined
      const mediaRecorder = new MediaRecorder(stream, options)
      mediaRecorderRef.current = mediaRecorder

      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data)
        }
      }

      mediaRecorder.onstop = () => {
        const type = mimeType || 'audio/webm'
        const blob = new Blob(audioChunksRef.current, { type })
        setAudioBlob(blob)
        const url = URL.createObjectURL(blob)
        setAudioUrl(url)
      }

      // Start recording
      mediaRecorder.start(100)
      setIsRecording(true)

      // Precise wall-clock timing using Date.now()
      startTimeRef.current = Date.now()
      setRecordingSeconds(0)
      durationRef.current = 0

      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current)
      }

      timerIntervalRef.current = setInterval(() => {
        if (startTimeRef.current) {
          const exactElapsedSecs = Math.floor((Date.now() - startTimeRef.current) / 1000)
          setRecordingSeconds(exactElapsedSecs)
          durationRef.current = exactElapsedSecs
        }
      }, 250) // checks frequently, but updates only according to real wall-clock seconds
    } catch (err) {
      console.error('Microphone access denied or error:', err)
      if (onError) {
        onError('Could not access microphone. Please check permissions.')
      }
      onCancel()
    }
  }

  const handleStopRecording = () => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current)
      timerIntervalRef.current = null
    }

    if (startTimeRef.current) {
      const finalSecs = Math.max(1, Math.round((Date.now() - startTimeRef.current) / 1000))
      setRecordingSeconds(finalSecs)
      durationRef.current = finalSecs
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
    }
  }

  const handleCancel = () => {
    cleanup()
    onCancel()
  }

  const handleSend = () => {
    const finalDuration = startTimeRef.current
      ? Math.max(1, Math.round((Date.now() - startTimeRef.current) / 1000))
      : (durationRef.current || recordingSeconds || 1)

    if (isRecording) {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current)
        timerIntervalRef.current = null
      }
      if (mediaRecorderRef.current) {
        mediaRecorderRef.current.onstop = () => {
          const type = mediaRecorderRef.current.mimeType || 'audio/webm'
          const blob = new Blob(audioChunksRef.current, { type })
          convertAndSend(blob, finalDuration)
        }
        mediaRecorderRef.current.stop()
        setIsRecording(false)
      }
    } else if (audioBlob) {
      convertAndSend(audioBlob, finalDuration)
    }
  }

  const convertAndSend = (blob, duration) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      const base64Audio = reader.result
      onSendAudio(base64Audio, duration || 1)
      cleanup()
    }
    reader.readAsDataURL(blob)
  }

  const togglePreview = () => {
    if (!audioPreviewRef.current) return
    if (isPlayingPreview) {
      audioPreviewRef.current.pause()
      setIsPlayingPreview(false)
    } else {
      audioPreviewRef.current.play()
      setIsPlayingPreview(true)
    }
  }

  const formatTime = (secs) => {
    const m = Math.floor(secs / 60)
    const s = secs % 60
    return `${m}:${s < 10 ? '0' : ''}${s}`
  }

  return (
    <div className="voice-recorder-bar">
      <div className="voice-recorder-left">
        <button
          type="button"
          className="voice-btn-trash"
          onClick={handleCancel}
          title="Discard voice message"
        >
          <Trash2 size={18} />
        </button>

        <div className="voice-indicator">
          {isRecording ? (
            <>
              <div className="voice-pulse-dot" />
              <span className="voice-timer">{formatTime(recordingSeconds)}</span>
              <div className="voice-wave-animation">
                <span /><span /><span /><span /><span />
              </div>
            </>
          ) : (
            <>
              <button type="button" className="voice-play-toggle" onClick={togglePreview}>
                {isPlayingPreview ? <Pause size={16} /> : <Play size={16} />}
              </button>
              <audio
                ref={audioPreviewRef}
                src={audioUrl}
                onEnded={() => setIsPlayingPreview(false)}
                style={{ display: 'none' }}
              />
              <span className="voice-timer">Preview: {formatTime(recordingSeconds)}</span>
            </>
          )}
        </div>
      </div>

      <div className="voice-recorder-right">
        {isRecording && (
          <button
            type="button"
            className="voice-btn-stop"
            onClick={handleStopRecording}
            title="Stop & review"
          >
            <Square size={16} />
          </button>
        )}
        <button
          type="button"
          className="voice-btn-send"
          onClick={handleSend}
          title="Send voice note"
        >
          <Send size={16} />
        </button>
      </div>
    </div>
  )
}
