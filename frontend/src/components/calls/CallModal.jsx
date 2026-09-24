import React, { useState, useEffect, useRef } from 'react'
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  PhoneOff,
  Maximize2,
  Minimize2,
  User,
  ShieldCheck
} from 'lucide-react'
import { createOutgoingRingback } from '../../services/audioUtils'

export default function CallModal({
  callSession, // { callId, isCaller, type, otherUser, localStream, remoteStream, status, endCall, toggleMic, toggleCam }
  onClose
}) {
  const isVideo = callSession.type === 'video'
  const isConnected = callSession.status === 'connected'

  const [isMicOn, setIsMicOn] = useState(true)
  const [isCamOn, setIsCamOn] = useState(isVideo)
  const [callDuration, setCallDuration] = useState(0)
  const [isFullScreen, setIsFullScreen] = useState(false)
  const [autoplayBlocked, setAutoplayBlocked] = useState(false)

  const localVideoRef = useRef(null)
  const remoteVideoRef = useRef(null)
  const remoteAudioRef = useRef(null)
  const ringbackRef = useRef(null)
  const timerRef = useRef(null)

  // Attach local stream
  useEffect(() => {
    const videoEl = localVideoRef.current
    if (videoEl && callSession.localStream) {
      if (videoEl.srcObject !== callSession.localStream) {
        videoEl.srcObject = callSession.localStream
      }
      videoEl.play().catch((e) => console.warn('Local video play error:', e))
    }
  }, [callSession.localStream])

  // Attach remote stream (to video or audio element)
  useEffect(() => {
    const mediaEl = isVideo ? remoteVideoRef.current : remoteAudioRef.current
    if (mediaEl && callSession.remoteStream) {
      if (mediaEl.srcObject !== callSession.remoteStream) {
        mediaEl.srcObject = callSession.remoteStream
      }

      const attemptPlay = () => {
        const promise = mediaEl.play()
        if (promise !== undefined) {
          promise
            .then(() => {
              setAutoplayBlocked(false)
            })
            .catch((err) => {
              console.warn('Remote media play error / autoplay blocked:', err)
              if (err.name === 'NotAllowedError') {
                setAutoplayBlocked(true)
              }
            })
        }
      }

      mediaEl.onloadedmetadata = attemptPlay
      attemptPlay()
    }
  }, [callSession.remoteStream, callSession.status, isVideo])

  const handleUserInteraction = () => {
    if (autoplayBlocked) {
      const mediaEl = isVideo ? remoteVideoRef.current : remoteAudioRef.current
      if (mediaEl) {
        mediaEl.play().then(() => setAutoplayBlocked(false)).catch((e) => console.warn('Play error:', e))
      }
    }
  }

  // Play outgoing ringtone if caller and ringing
  useEffect(() => {
    if (callSession.isCaller && callSession.status === 'ringing') {
      ringbackRef.current = createOutgoingRingback()
    } else {
      if (ringbackRef.current) {
        ringbackRef.current.stop()
        ringbackRef.current = null
      }
    }

    return () => {
      if (ringbackRef.current) {
        ringbackRef.current.stop()
        ringbackRef.current = null
      }
    }
  }, [callSession.isCaller, callSession.status])

  // Timer when connected
  useEffect(() => {
    if (callSession.status === 'connected') {
      timerRef.current = setInterval(() => {
        setCallDuration((prev) => prev + 1)
      }, 1000)
    } else {
      if (timerRef.current) clearInterval(timerRef.current)
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [callSession.status])

  const handleToggleMic = () => {
    const next = !isMicOn
    setIsMicOn(next)
    callSession.toggleMic(next)
  }

  const handleToggleCam = () => {
    const next = !isCamOn
    setIsCamOn(next)
    callSession.toggleCam(next)
  }

  const handleEndCall = () => {
    if (ringbackRef.current) ringbackRef.current.stop()
    if (timerRef.current) clearInterval(timerRef.current)
    callSession.endCall()
    onClose()
  }

  const toggleFullScreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {})
      setIsFullScreen(true)
    } else {
      document.exitFullscreen().catch(() => {})
      setIsFullScreen(false)
    }
  }

  const formatTimer = (secs) => {
    const m = Math.floor(secs / 60)
    const s = secs % 60
    return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`
  }

  return (
    <div className={`call-modal-backdrop ${isFullScreen ? 'fullscreen' : ''}`}>
      <div className="call-modal-container">
        {/* Top Header */}
        <div className="call-header-bar">
          <div className="call-header-info">
            <span className="call-header-name">
              {callSession.otherUser?.username || callSession.otherUser?.email?.split('@')[0] || 'User'}
            </span>
            <span className="call-header-status">
              {isConnected ? (
                <>Connected • {formatTimer(callDuration)}</>
              ) : (
                <>Ringing...</>
              )}
            </span>
          </div>

          <div className="call-header-security">
            <ShieldCheck size={16} />
            <span>P2P Encrypted</span>
          </div>
        </div>

        {/* Video or Audio Screen */}
        <div className="call-viewport" onClick={handleUserInteraction}>
          {autoplayBlocked && (
            <div className="call-autoplay-toast">
              <span>Tap anywhere to enable video & audio</span>
            </div>
          )}

          {isVideo ? (
            <div className="call-video-grid">
              {/* Remote Video Stream */}
              <div className="call-remote-video-wrap">
                <video
                  ref={remoteVideoRef}
                  autoPlay
                  playsInline
                  className="call-remote-video"
                />
                {!isConnected && (
                  <div className="call-waiting-overlay">
                    <div className="call-pulsing-avatar">
                      {callSession.otherUser?.photoURL ? (
                        <img
                          src={callSession.otherUser.photoURL}
                          alt="Avatar"
                          className="call-avatar-img"
                        />
                      ) : (
                        <User size={54} />
                      )}
                    </div>
                    <p>Connecting video call...</p>
                  </div>
                )}
              </div>

              {/* Local Video Pip */}
              <div className={`call-local-pip ${!isCamOn ? 'cam-off' : ''}`}>
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="call-local-video"
                />
                {!isCamOn && (
                  <div className="call-pip-placeholder">
                    <VideoOff size={20} />
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* Audio Only View */
            <div className="call-audio-view">
              <audio ref={remoteAudioRef} autoPlay playsInline />
              <div className="call-audio-avatar-wrap">
                <div className={`call-audio-ripple ${isConnected ? 'active' : ''}`} />
                {callSession.otherUser?.photoURL ? (
                  <img
                    src={callSession.otherUser.photoURL}
                    alt="Avatar"
                    className="call-audio-avatar"
                  />
                ) : (
                  <div className="call-audio-avatar-fallback">
                    <User size={64} />
                  </div>
                )}
              </div>
              <h2 className="call-audio-name">
                {callSession.otherUser?.username || callSession.otherUser?.email?.split('@')[0] || 'User'}
              </h2>
              <div className="call-audio-timer">
                {isConnected ? formatTimer(callDuration) : 'Calling...'}
              </div>
            </div>
          )}
        </div>

        {/* Call Controls Bar */}
        <div className="call-controls-bar">
          <button
            type="button"
            className={`call-control-btn ${!isMicOn ? 'off' : ''}`}
            onClick={handleToggleMic}
            title={isMicOn ? 'Mute Microphone' : 'Unmute Microphone'}
          >
            {isMicOn ? <Mic size={22} /> : <MicOff size={22} />}
          </button>

          {isVideo && (
            <button
              type="button"
              className={`call-control-btn ${!isCamOn ? 'off' : ''}`}
              onClick={handleToggleCam}
              title={isCamOn ? 'Turn Video Off' : 'Turn Video On'}
            >
              {isCamOn ? <Video size={22} /> : <VideoOff size={22} />}
            </button>
          )}

          <button
            type="button"
            className="call-control-btn"
            onClick={toggleFullScreen}
            title={isFullScreen ? 'Exit Fullscreen' : 'Fullscreen'}
          >
            {isFullScreen ? <Minimize2 size={22} /> : <Maximize2 size={22} />}
          </button>

          <button
            type="button"
            className="call-control-btn end-call"
            onClick={handleEndCall}
            title="End Call"
          >
            <PhoneOff size={24} />
          </button>
        </div>
      </div>
    </div>
  )
}
