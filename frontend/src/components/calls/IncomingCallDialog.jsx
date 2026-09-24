import React, { useEffect, useRef } from 'react'
import { Phone, PhoneOff, Video, User, Users } from 'lucide-react'
import { createIncomingRingtone } from '../../services/audioUtils'

export default function IncomingCallDialog({ incomingCall, onAccept, onDecline }) {
  const ringtoneRef = useRef(null)

  useEffect(() => {
    // Start incoming melodious ringtone
    ringtoneRef.current = createIncomingRingtone()
    return () => {
      if (ringtoneRef.current) ringtoneRef.current.stop()
    }
  }, [])

  const handleAccept = () => {
    if (ringtoneRef.current) ringtoneRef.current.stop()
    onAccept(incomingCall)
  }

  const handleDecline = () => {
    if (ringtoneRef.current) ringtoneRef.current.stop()
    onDecline(incomingCall.id)
  }

  const isVideo = incomingCall.type === 'video'
  const isGroup = incomingCall.isGroup || incomingCall.chatType === 'group'

  return (
    <div className="incoming-call-overlay">
      <div className="incoming-call-card">
        <div className="incoming-call-pulse">
          {isGroup ? (
            incomingCall.groupPhoto ? (
              <img src={incomingCall.groupPhoto} alt={incomingCall.groupName} className="incoming-avatar" />
            ) : (
              <div className="incoming-avatar-fallback group-fallback">
                <Users size={36} />
              </div>
            )
          ) : incomingCall.callerPhoto ? (
            <img src={incomingCall.callerPhoto} alt={incomingCall.callerName} className="incoming-avatar" />
          ) : (
            <div className="incoming-avatar-fallback">
              <User size={36} />
            </div>
          )}
        </div>

        {isGroup ? (
          <>
            <h3 className="incoming-caller-name">{incomingCall.groupName || 'Group'}</h3>
            <p className="incoming-group-caller-sub">
              Started by {incomingCall.callerName || 'a group member'}
            </p>
            <p className="incoming-call-type">
              <Video size={16} /> Incoming Group Video Call...
            </p>
          </>
        ) : (
          <>
            <h3 className="incoming-caller-name">{incomingCall.callerName || 'Someone'}</h3>
            <p className="incoming-call-type">
              {isVideo ? (
                <>
                  <Video size={16} /> Incoming Video Call...
                </>
              ) : (
                <>
                  <Phone size={16} /> Incoming Voice Call...
                </>
              )}
            </p>
          </>
        )}

        <div className="incoming-call-actions">
          <div className="incoming-action-col">
            <button
              type="button"
              className="call-btn-decline"
              onClick={handleDecline}
              title="Decline"
            >
              <PhoneOff size={24} />
            </button>
            <span className="call-action-label">Decline</span>
          </div>

          <div className="incoming-action-col">
            <button
              type="button"
              className="call-btn-accept"
              onClick={handleAccept}
              title={isGroup ? 'Pick / Join Call' : 'Pick Call'}
            >
              {isVideo ? <Video size={24} /> : <Phone size={24} />}
            </button>
            <span className="call-action-label call-action-label-accept">
              {isGroup ? 'Pick Call / Join' : 'Pick Call'}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
