import React, { useState, useRef, useEffect } from 'react'
import { Play, Pause, Volume2, Mic } from 'lucide-react'

export default function AudioMessageBubble({ audioUrl, duration = 0, isMine = false }) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [audioDuration, setAudioDuration] = useState(duration || 0)
  const [playbackSpeed, setPlaybackSpeed] = useState(1)

  const audioRef = useRef(null)

  useEffect(() => {
    if (duration && !audioDuration) {
      setAudioDuration(duration)
    }
  }, [duration])

  const togglePlay = () => {
    if (!audioRef.current) return
    if (isPlaying) {
      audioRef.current.pause()
      setIsPlaying(false)
    } else {
      audioRef.current.play().catch(e => console.warn('Play error:', e))
      setIsPlaying(true)
    }
  }

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime)
    }
  }

  const handleLoadedMetadata = () => {
    if (audioRef.current && (!audioDuration || isNaN(audioDuration))) {
      setAudioDuration(audioRef.current.duration)
    }
  }

  const handleEnded = () => {
    setIsPlaying(false)
    setCurrentTime(0)
  }

  const handleSeek = (e) => {
    const newTime = parseFloat(e.target.value)
    setCurrentTime(newTime)
    if (audioRef.current) {
      audioRef.current.currentTime = newTime
    }
  }

  const toggleSpeed = () => {
    const speeds = [1, 1.5, 2]
    const nextIdx = (speeds.indexOf(playbackSpeed) + 1) % speeds.length
    const nextSpeed = speeds[nextIdx]
    setPlaybackSpeed(nextSpeed)
    if (audioRef.current) {
      audioRef.current.playbackRate = nextSpeed
    }
  }

  const formatSecs = (secs) => {
    if (!secs || isNaN(secs) || secs === Infinity) return '0:00'
    const m = Math.floor(secs / 60)
    const s = Math.floor(secs % 60)
    return `${m}:${s < 10 ? '0' : ''}${s}`
  }

  const progressPct = audioDuration > 0 ? (currentTime / audioDuration) * 100 : 0

  return (
    <div className={`audio-message-bubble ${isMine ? 'mine' : 'theirs'}`}>
      <audio
        ref={audioRef}
        src={audioUrl}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={handleEnded}
        preload="metadata"
      />

      <button
        type="button"
        className="audio-play-btn"
        onClick={(e) => {
          e.stopPropagation()
          togglePlay()
        }}
        title={isPlaying ? 'Pause' : 'Play voice note'}
      >
        {isPlaying ? <Pause size={18} /> : <Play size={18} style={{ marginLeft: 2 }} />}
      </button>

      <div className="audio-wave-container" onClick={(e) => e.stopPropagation()}>
        <div className="audio-wave-bars">
          {[40, 75, 55, 90, 60, 85, 30, 95, 70, 50, 80, 45, 100, 65, 85, 40, 70, 90, 50, 60].map((h, i) => {
            const barPct = (i / 20) * 100
            const active = progressPct >= barPct
            return (
              <span
                key={i}
                className={`audio-bar ${active ? 'active' : ''}`}
                style={{ height: `${h}%` }}
              />
            )
          })}
        </div>

        <input
          type="range"
          min="0"
          max={audioDuration || 1}
          step="0.1"
          value={currentTime}
          onClick={(e) => e.stopPropagation()}
          onChange={handleSeek}
          className="audio-scrubber"
        />

        <div className="audio-timing-row">
          <span>{isPlaying ? formatSecs(currentTime) : formatSecs(audioDuration || duration)}</span>
          <button
            type="button"
            className="audio-speed-btn"
            onClick={(e) => {
              e.stopPropagation()
              toggleSpeed()
            }}
            title="Change speed"
          >
            {playbackSpeed}x
          </button>
        </div>
      </div>

      <div className="audio-mic-icon">
        <Mic size={14} />
      </div>
    </div>
  )
}
