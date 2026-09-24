import React, { useState, useEffect, useRef } from 'react'
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  PhoneOff,
  Maximize2,
  Minimize2,
  Users,
  ShieldCheck,
  Crown,
  Monitor,
  Pin,
  PinOff,
  X
} from 'lucide-react'

// Sub-component for individual participant video tile
function ParticipantTile({
  participant,
  stream,
  isMe,
  isHost,
  isPinned,
  onTogglePin,
  isMuted,
  isCamOff
}) {
  const videoRef = useRef(null)
  const audioRef = useRef(null)

  useEffect(() => {
    const videoEl = videoRef.current
    if (videoEl && stream) {
      if (videoEl.srcObject !== stream) {
        videoEl.srcObject = stream
      }
      if (videoEl.paused) {
        const playPromise = videoEl.play()
        if (playPromise !== undefined) {
          playPromise.catch((e) => {
            if (e.name !== 'AbortError') {
              console.warn('Tile video play error:', e)
            }
          })
        }
      }
    }
  }, [stream])

  useEffect(() => {
    const audioEl = audioRef.current
    if (!isMe && audioEl && stream) {
      if (audioEl.srcObject !== stream) {
        audioEl.srcObject = stream
      }
      if (audioEl.paused) {
        const playPromise = audioEl.play()
        if (playPromise !== undefined) {
          playPromise.catch((e) => {
            if (e.name !== 'AbortError') {
              console.warn('Tile audio play error:', e)
            }
          })
        }
      }
    }
  }, [stream, isMe])

  const hasVideoStream = stream && stream.getVideoTracks && stream.getVideoTracks().some(t => t.readyState === 'live' && t.enabled)
  const showVideo = !isCamOff && hasVideoStream

  return (
    <div className={`group-call-tile ${isPinned ? 'pinned' : ''}`}>
      {/* Hidden audio element for remote stream to guarantee clear audio */}
      {!isMe && <audio ref={audioRef} autoPlay playsInline />}

      {/* Video element - muted={true} ensures browser never blocks video stream, audio is handled by audio tag */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={true}
        className={`group-tile-video ${showVideo ? 'visible' : 'hidden'}`}
      />

      {/* Avatar fallback when camera is off */}
      {!showVideo && (
        <div className="group-tile-avatar-wrap">
          <div className="group-tile-avatar-circle">
            {participant?.photoURL ? (
              <img src={participant.photoURL} alt={participant.name} className="group-tile-avatar-img" />
            ) : (
              <span className="group-tile-avatar-letter">
                {(participant?.name || 'U')[0].toUpperCase()}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Participant info badge */}
      <div className="group-tile-badge">
        <div className="group-tile-badge-name">
          {isHost && <Crown size={13} className="host-crown-icon" title="Host" />}
          <span>{participant?.name || 'Participant'} {isMe && '(You)'}</span>
        </div>

        <div className={`group-tile-mic-status ${isMuted ? 'muted' : 'active'}`}>
          {isMuted ? <MicOff size={13} /> : <Mic size={13} />}
        </div>
      </div>

      {/* Pin / Spotlight action button on hover */}
      {onTogglePin && (
        <button
          type="button"
          className="group-tile-pin-btn"
          onClick={(e) => {
            e.stopPropagation()
            onTogglePin(participant.uid)
          }}
          title={isPinned ? 'Unpin' : 'Pin to spotlight'}
        >
          {isPinned ? <PinOff size={15} /> : <Pin size={15} />}
        </button>
      )}
    </div>
  )
}

export default function GroupCallModal({
  groupChat,
  callSession,
  currentUser,
  usersMap = {},
  onClose
}) {
  const [isMicOn, setIsMicOn] = useState(true)
  const [isCamOn, setIsCamOn] = useState(true)
  const [isScreenSharing, setIsScreenSharing] = useState(false)
  const [callDuration, setCallDuration] = useState(0)
  const [isFullScreen, setIsFullScreen] = useState(false)
  const [pinnedUid, setPinnedUid] = useState(null)
  const [showDrawer, setShowDrawer] = useState(false)
  const [showEndConfirm, setShowEndConfirm] = useState(false)
  const [autoplayBlocked, setAutoplayBlocked] = useState(false)

  const timerRef = useRef(null)

  // Track duration
  useEffect(() => {
    timerRef.current = setInterval(() => {
      setCallDuration((prev) => prev + 1)
    }, 1000)

    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [])

  const formatTimer = (secs) => {
    const m = Math.floor(secs / 60)
    const s = secs % 60
    return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`
  }

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

  const handleToggleScreenShare = async () => {
    const sharing = await callSession.toggleScreenShare()
    setIsScreenSharing(sharing)
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

  const handleLeaveCall = () => {
    callSession.leaveCall()
    onClose()
  }

  const handleEndCallForEveryone = () => {
    callSession.endCallForEveryone()
    onClose()
  }

  // Participants list with details
  const participants = callSession.participants || []
  const remoteStreams = callSession.remoteStreams || {}
  const localStream = callSession.localStream

  // Find local participant object
  const meParticipant = participants.find((p) => p.uid === currentUser.uid) || {
    uid: currentUser.uid,
    name: currentUser.displayName || currentUser.email.split('@')[0],
    photoURL: currentUser.photoURL || null,
    isMuted: !isMicOn,
    isCamOff: !isCamOn
  }

  // Remote participants
  const otherParticipants = participants.filter((p) => p.uid !== currentUser.uid)
  const totalCount = participants.length || 1

  // Compute grid columns class based on participant count
  const getGridClass = () => {
    if (pinnedUid) return 'grid-spotlight'
    if (totalCount === 1) return 'grid-single'
    if (totalCount === 2) return 'grid-double'
    if (totalCount <= 4) return 'grid-quad'
    if (totalCount <= 6) return 'grid-six'
    return 'grid-many'
  }

  return (
    <div className={`group-call-backdrop ${isFullScreen ? 'fullscreen' : ''}`}>
      <div className="group-call-container">
        {/* Top Header Bar */}
        <div className="group-call-header">
          <div className="group-call-header-info">
            <div className="group-call-avatar-wrap">
              {groupChat?.photoURL ? (
                <img src={groupChat.photoURL} alt={groupChat.name} className="group-call-avatar" />
              ) : (
                <div className="group-call-avatar-placeholder">
                  <Users size={18} />
                </div>
              )}
            </div>
            <div>
              <div className="group-call-title-row">
                <h3 className="group-call-name">{groupChat?.name || 'Group Video Call'}</h3>
                <span className="group-call-live-pill">
                  <span className="live-pulse-dot" /> LIVE
                </span>
              </div>
              <span className="group-call-timer">
                {formatTimer(callDuration)} • {totalCount} {totalCount === 1 ? 'member' : 'members'} in call
              </span>
            </div>
          </div>

          <div className="group-call-header-actions">
            <div className="group-call-encrypted-tag">
              <ShieldCheck size={15} />
              <span>Mesh E2E</span>
            </div>

            <button
              type="button"
              className={`group-call-header-btn ${showDrawer ? 'active' : ''}`}
              onClick={() => setShowDrawer((prev) => !prev)}
              title="Participants list"
            >
              <Users size={18} />
              <span className="header-badge-count">{totalCount}</span>
            </button>

            <button
              type="button"
              className="group-call-header-btn"
              onClick={toggleFullScreen}
              title={isFullScreen ? 'Exit Fullscreen' : 'Fullscreen'}
            >
              {isFullScreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
            </button>
          </div>
        </div>

        {/* Main Calling Stage */}
        <div className="group-call-main-stage">
          {autoplayBlocked && (
            <div
              className="group-call-autoplay-toast"
              onClick={() => setAutoplayBlocked(false)}
            >
              <span>Tap anywhere to enable audio</span>
            </div>
          )}

          {/* Video Grid */}
          <div className={`group-call-grid ${getGridClass()}`}>
            {/* When Spotlight / Pinned User is chosen */}
            {pinnedUid && (
              <div className="group-spotlight-main">
                {pinnedUid === currentUser.uid ? (
                  <ParticipantTile
                    key="spotlight-local-user-tile"
                    participant={meParticipant}
                    stream={localStream}
                    isMe={true}
                    isHost={callSession.isHost}
                    isPinned={true}
                    onTogglePin={() => setPinnedUid(null)}
                    isMuted={!isMicOn}
                    isCamOff={!isCamOn}
                  />
                ) : (
                  (() => {
                    const p = participants.find((x) => x.uid === pinnedUid)
                    return (
                      <ParticipantTile
                        key={pinnedUid}
                        participant={p}
                        stream={remoteStreams[pinnedUid]}
                        isMe={false}
                        isHost={p?.uid === groupChat?.createdBy}
                        isPinned={true}
                        onTogglePin={() => setPinnedUid(null)}
                        isMuted={p?.isMuted}
                        isCamOff={p?.isCamOff}
                      />
                    )
                  })()
                )}
              </div>
            )}

            {/* Standard Grid Tiles */}
            {/* 1. Local Participant */}
            {(!pinnedUid || pinnedUid !== currentUser.uid) && (
              <ParticipantTile
                key="local-user-tile"
                participant={meParticipant}
                stream={localStream}
                isMe={true}
                isHost={callSession.isHost}
                isPinned={false}
                onTogglePin={() => setPinnedUid(currentUser.uid)}
                isMuted={!isMicOn}
                isCamOff={!isCamOn}
              />
            )}

            {/* 2. Remote Participants */}
            {otherParticipants.map((p) => {
              if (pinnedUid === p.uid) return null
              return (
                <ParticipantTile
                  key={p.uid}
                  participant={p}
                  stream={remoteStreams[p.uid]}
                  isMe={false}
                  isHost={p.uid === groupChat?.createdBy}
                  isPinned={false}
                  onTogglePin={() => setPinnedUid(p.uid)}
                  isMuted={p.isMuted}
                  isCamOff={p.isCamOff}
                />
              )
            })}
          </div>

          {/* Single Participant Empty State Card */}
          {totalCount === 1 && (
            <div className="group-call-waiting-notice">
              <div className="waiting-pulse-rings">
                <Users size={28} />
              </div>
              <h4>Waiting for other group members to join...</h4>
              <p>Other members in "{groupChat?.name}" have been notified and can join anytime!</p>
            </div>
          )}

          {/* Slide-out Participants Drawer */}
          {showDrawer && (
            <div className="group-call-drawer">
              <div className="group-call-drawer-header">
                <h4>Group Members ({groupChat?.participants?.length || 0})</h4>
                <button
                  type="button"
                  className="drawer-close-btn"
                  onClick={() => setShowDrawer(false)}
                >
                  <X size={18} />
                </button>
              </div>

              <div className="drawer-members-list">
                <div className="drawer-section-title">In this call ({totalCount})</div>
                {participants.map((p) => {
                  const isMe = p.uid === currentUser.uid
                  return (
                    <div key={p.uid} className="drawer-member-item in-call">
                      <div className="drawer-member-avatar-wrap">
                        {p.photoURL ? (
                          <img src={p.photoURL} alt={p.name} className="drawer-avatar" />
                        ) : (
                          <div className="drawer-avatar-fallback">{(p.name || 'U')[0].toUpperCase()}</div>
                        )}
                        <span className="drawer-live-dot" />
                      </div>
                      <div className="drawer-member-info">
                        <span className="drawer-member-name">
                          {p.name} {isMe && '(You)'}
                        </span>
                        <span className="drawer-member-status">Connected</span>
                      </div>
                      <div className="drawer-member-audio-state">
                        {p.isMuted ? <MicOff size={14} color="#ef4444" /> : <Mic size={14} color="#10b981" />}
                      </div>
                    </div>
                  )
                })}

                {/* Not in call members */}
                {groupChat?.participants && (
                  <>
                    <div className="drawer-section-title mt-3">Other group members</div>
                    {groupChat.participants
                      .filter((uid) => !participants.some((p) => p.uid === uid))
                      .map((uid) => {
                        const u = usersMap[uid] || { uid, username: 'Member' }
                        return (
                          <div key={uid} className="drawer-member-item not-in-call">
                            <div className="drawer-member-avatar-wrap">
                              {u.photoURL ? (
                                <img src={u.photoURL} alt={u.username} className="drawer-avatar" />
                              ) : (
                                <div className="drawer-avatar-fallback">{(u.username || 'U')[0].toUpperCase()}</div>
                              )}
                            </div>
                            <div className="drawer-member-info">
                              <span className="drawer-member-name">{u.username || u.email?.split('@')[0] || 'Member'}</span>
                              <span className="drawer-member-status">Not in call</span>
                            </div>
                          </div>
                        )
                      })}
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Bottom Floating Control Bar */}
        <div className="group-call-controls-bar">
          <button
            type="button"
            className={`group-control-btn ${!isMicOn ? 'off' : ''}`}
            onClick={handleToggleMic}
            title={isMicOn ? 'Mute Microphone' : 'Unmute Microphone'}
          >
            {isMicOn ? <Mic size={22} /> : <MicOff size={22} />}
          </button>

          <button
            type="button"
            className={`group-control-btn ${!isCamOn ? 'off' : ''}`}
            onClick={handleToggleCam}
            title={isCamOn ? 'Turn Camera Off' : 'Turn Camera On'}
          >
            {isCamOn ? <Video size={22} /> : <VideoOff size={22} />}
          </button>

          <button
            type="button"
            className={`group-control-btn ${isScreenSharing ? 'active-share' : ''}`}
            onClick={handleToggleScreenShare}
            title={isScreenSharing ? 'Stop Screen Share' : 'Share Screen'}
          >
            <Monitor size={22} />
          </button>

          <button
            type="button"
            className={`group-control-btn ${showDrawer ? 'active-drawer' : ''}`}
            onClick={() => setShowDrawer((prev) => !prev)}
            title="Toggle Participants"
          >
            <Users size={22} />
          </button>

          {/* Leave / End Button */}
          <div className="leave-btn-container" style={{ position: 'relative' }}>
            <button
              type="button"
              className="group-control-btn end-call"
              onClick={() => {
                if (callSession.isHost) {
                  setShowEndConfirm(true)
                } else {
                  handleLeaveCall()
                }
              }}
              title="Leave Call"
            >
              <PhoneOff size={24} />
            </button>

            {/* Host Leave vs End for Everyone Confirmation Popup */}
            {showEndConfirm && (
              <div className="group-end-confirm-popover">
                <button
                  type="button"
                  className="popover-btn leave"
                  onClick={handleLeaveCall}
                >
                  Leave Call
                </button>
                <button
                  type="button"
                  className="popover-btn end-all"
                  onClick={handleEndCallForEveryone}
                >
                  End Call for Everyone
                </button>
                <button
                  type="button"
                  className="popover-btn cancel"
                  onClick={() => setShowEndConfirm(false)}
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
