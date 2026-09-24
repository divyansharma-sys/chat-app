// WebRTC Peer-to-Peer Audio & Video Calling with Firestore Signaling
import { db } from '../firebase'
import {
  collection,
  doc,
  setDoc,
  updateDoc,
  onSnapshot,
  addDoc,
  serverTimestamp,
  getDoc
} from 'firebase/firestore'

const rtcConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
    { urls: 'stun:global.stun.twilio.com:3478' }
  ],
  iceCandidatePoolSize: 10
}

/**
 * Initiates an outgoing call
 */
export async function startCall({
  callerUser,
  calleeUid,
  calleeUser,
  chatId,
  isVideo = true,
  onLocalStream,
  onRemoteStream,
  onCallConnected,
  onCallEnd
}) {
  const pc = new RTCPeerConnection(rtcConfig)
  let localStream = null
  let unsubCall = null
  let unsubCalleeCandidates = null
  let remoteDescReady = false
  let isEnded = false
  const candidateQueue = []
  const remoteStream = new MediaStream()

  pc.onconnectionstatechange = () => {
    console.log('[WebRTC Caller] Connection state:', pc.connectionState)
    if (pc.connectionState === 'connected' && onCallConnected) {
      onCallConnected()
    }
    if (['failed', 'closed'].includes(pc.connectionState)) {
      cleanup()
      if (onCallEnd) onCallEnd(pc.connectionState)
    }
  }

  pc.oniceconnectionstatechange = () => {
    console.log('[WebRTC Caller] ICE connection state:', pc.iceConnectionState)
    if (['failed', 'closed'].includes(pc.iceConnectionState)) {
      cleanup()
      if (onCallEnd) onCallEnd(pc.iceConnectionState)
    }
  }

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw new Error('Camera/Microphone access requires HTTPS or localhost. Please access via https:// or test on localhost.')
  }

  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: isVideo ? { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' } : false
    })
  } catch (err) {
    console.error('Camera/Mic permission error:', err)
    throw new Error('Could not access microphone or camera. Please grant browser permissions.')
  }

  if (onLocalStream) onLocalStream(localStream)

  // Add tracks to PeerConnection
  localStream.getTracks().forEach((track) => {
    pc.addTrack(track, localStream)
  })

  // Handle incoming remote track
  pc.ontrack = (event) => {
    console.log('[WebRTC Caller] ontrack:', event.track.kind, event.track.id)
    if (event.streams && event.streams[0]) {
      event.streams[0].getTracks().forEach((track) => {
        if (!remoteStream.getTracks().some(t => t.id === track.id)) {
          remoteStream.addTrack(track)
        }
      })
    } else if (event.track) {
      if (!remoteStream.getTracks().some(t => t.id === event.track.id)) {
        remoteStream.addTrack(event.track)
      }
    }

    if (onRemoteStream) {
      onRemoteStream(remoteStream)
    }

    event.track.onunmute = () => {
      console.log('[WebRTC Caller] Remote track unmuted:', event.track.kind)
      if (onRemoteStream) {
        onRemoteStream(remoteStream)
      }
    }
  }

  // Create Firestore Call Document
  const callsRef = collection(db, 'calls')
  const callDoc = doc(callsRef)
  const callId = callDoc.id

  const callerCandidatesRef = collection(db, 'calls', callId, 'callerCandidates')
  const calleeCandidatesRef = collection(db, 'calls', callId, 'calleeCandidates')

  // ICE Candidates from Caller
  pc.onicecandidate = (event) => {
    if (event.candidate) {
      addDoc(callerCandidatesRef, event.candidate.toJSON()).catch(e => console.warn('Candidate write err:', e))
    }
  }

  // Create and set Offer
  const offerDescription = await pc.createOffer()
  await pc.setLocalDescription(offerDescription)

  const callData = {
    id: callId,
    chatId: chatId || null,
    callerUid: callerUser.uid,
    callerEmail: callerUser.email,
    callerName: callerUser.displayName || callerUser.email.split('@')[0],
    callerPhoto: callerUser.photoURL || null,
    calleeUid,
    calleeEmail: calleeUser?.email || '',
    calleeName: calleeUser?.username || calleeUser?.email?.split('@')[0] || 'User',
    type: isVideo ? 'video' : 'audio',
    status: 'ringing', // 'ringing' | 'connected' | 'declined' | 'ended'
    offer: {
      type: offerDescription.type,
      sdp: offerDescription.sdp
    },
    createdAt: serverTimestamp()
  }

  await setDoc(callDoc, callData)

  // Listen for Callee Answer
  unsubCall = onSnapshot(callDoc, async (snapshot) => {
    const data = snapshot.data()
    if (!data) return

    if (!pc.currentRemoteDescription && data.answer) {
      const answerDescription = new RTCSessionDescription(data.answer)
      await pc.setRemoteDescription(answerDescription)
      remoteDescReady = true

      // Flush queued candidates that arrived before remote description was set
      while (candidateQueue.length > 0) {
        const cand = candidateQueue.shift()
        try {
          await pc.addIceCandidate(cand)
        } catch (e) {
          console.warn('Queued ICE add error:', e)
        }
      }
    }

    if (data.status === 'connected') {
      if (onCallConnected) onCallConnected()
    }

    if (data.status === 'declined' || data.status === 'ended') {
      cleanup()
      if (onCallEnd) onCallEnd(data.status)
    }
  })

  // Listen for Callee ICE Candidates
  unsubCalleeCandidates = onSnapshot(calleeCandidatesRef, (snapshot) => {
    snapshot.docChanges().forEach(async (change) => {
      if (change.type === 'added') {
        const candData = change.doc.data()
        if (candData) {
          const candidate = new RTCIceCandidate(candData)
          if (remoteDescReady && pc.remoteDescription && pc.remoteDescription.type) {
            try {
              await pc.addIceCandidate(candidate)
            } catch (e) {
              console.warn('ICE add error:', e)
            }
          } else {
            // Queue candidate until remote description is set!
            candidateQueue.push(candidate)
          }
        }
      }
    })
  })

  const cleanup = () => {
    isEnded = true
    if (unsubCall) unsubCall()
    if (unsubCalleeCandidates) unsubCalleeCandidates()
    if (localStream) {
      localStream.getTracks().forEach((t) => t.stop())
    }
    try {
      pc.close()
    } catch (e) {}
  }

  const endCall = async () => {
    try {
      await updateDoc(doc(db, 'calls', callId), {
        status: 'ended',
        endedAt: serverTimestamp()
      })
    } catch (e) {}
    cleanup()
    if (onCallEnd) onCallEnd('ended')
  }

  const toggleMic = (enabled) => {
    if (localStream) {
      localStream.getAudioTracks().forEach((track) => {
        track.enabled = enabled
      })
    }
  }

  const toggleCam = (enabled) => {
    if (localStream) {
      localStream.getVideoTracks().forEach((track) => {
        track.enabled = enabled
      })
    }
  }

  return {
    callId,
    pc,
    localStream,
    remoteStream,
    isEnded: () => isEnded,
    endCall,
    toggleMic,
    toggleCam
  }
}

/**
 * Answers an incoming call
 */
export async function answerCall({
  callId,
  isVideo = true,
  onLocalStream,
  onRemoteStream,
  onCallEnd
}) {
  const pc = new RTCPeerConnection(rtcConfig)
  let localStream = null
  let unsubCall = null
  let unsubCallerCandidates = null
  let remoteDescReady = false
  let isEnded = false
  const candidateQueue = []
  const remoteStream = new MediaStream()

  pc.onconnectionstatechange = () => {
    console.log('[WebRTC Callee] Connection state:', pc.connectionState)
    if (['failed', 'closed'].includes(pc.connectionState)) {
      cleanup()
      if (onCallEnd) onCallEnd(pc.connectionState)
    }
  }

  pc.oniceconnectionstatechange = () => {
    console.log('[WebRTC Callee] ICE connection state:', pc.iceConnectionState)
    if (['failed', 'closed'].includes(pc.iceConnectionState)) {
      cleanup()
      if (onCallEnd) onCallEnd(pc.iceConnectionState)
    }
  }

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw new Error('Camera/Microphone access requires HTTPS or localhost. Please access via https:// or test on localhost.')
  }

  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: isVideo ? { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' } : false
    })
  } catch (err) {
    console.error('Camera/Mic permission error:', err)
    throw new Error('Could not access microphone or camera. Please grant permissions.')
  }

  if (onLocalStream) onLocalStream(localStream)

  localStream.getTracks().forEach((track) => {
    pc.addTrack(track, localStream)
  })

  pc.ontrack = (event) => {
    console.log('[WebRTC Callee] ontrack:', event.track.kind, event.track.id)
    if (event.streams && event.streams[0]) {
      event.streams[0].getTracks().forEach((track) => {
        if (!remoteStream.getTracks().some(t => t.id === track.id)) {
          remoteStream.addTrack(track)
        }
      })
    } else if (event.track) {
      if (!remoteStream.getTracks().some(t => t.id === event.track.id)) {
        remoteStream.addTrack(event.track)
      }
    }

    if (onRemoteStream) {
      onRemoteStream(remoteStream)
    }

    event.track.onunmute = () => {
      console.log('[WebRTC Callee] Remote track unmuted:', event.track.kind)
      if (onRemoteStream) {
        onRemoteStream(remoteStream)
      }
    }
  }

  const callDoc = doc(db, 'calls', callId)
  const callerCandidatesRef = collection(db, 'calls', callId, 'callerCandidates')
  const calleeCandidatesRef = collection(db, 'calls', callId, 'calleeCandidates')

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      addDoc(calleeCandidatesRef, event.candidate.toJSON()).catch(e => console.warn('Callee ICE candidate write error:', e))
    }
  }

  // Listen for Caller ICE Candidates (queue until remote description is ready)
  unsubCallerCandidates = onSnapshot(callerCandidatesRef, (snapshot) => {
    snapshot.docChanges().forEach(async (change) => {
      if (change.type === 'added') {
        const candData = change.doc.data()
        if (candData) {
          const candidate = new RTCIceCandidate(candData)
          if (remoteDescReady && pc.remoteDescription && pc.remoteDescription.type) {
            try {
              await pc.addIceCandidate(candidate)
            } catch (e) {
              console.warn('ICE add error:', e)
            }
          } else {
            candidateQueue.push(candidate)
          }
        }
      }
    })
  })

  const callSnap = await getDoc(callDoc)
  const callData = callSnap.data()
  if (!callData || !callData.offer) {
    throw new Error('Call is no longer active')
  }

  await pc.setRemoteDescription(new RTCSessionDescription(callData.offer))
  remoteDescReady = true

  // Flush any queued caller candidates
  while (candidateQueue.length > 0) {
    const cand = candidateQueue.shift()
    try {
      await pc.addIceCandidate(cand)
    } catch (e) {
      console.warn('Queued ICE add error:', e)
    }
  }

  const answerDescription = await pc.createAnswer()
  await pc.setLocalDescription(answerDescription)

  await updateDoc(callDoc, {
    answer: {
      type: answerDescription.type,
      sdp: answerDescription.sdp
    },
    status: 'connected',
    connectedAt: serverTimestamp()
  })

  unsubCall = onSnapshot(callDoc, (snapshot) => {
    const data = snapshot.data()
    if (!data) return
    if (data.status === 'ended' || data.status === 'declined') {
      cleanup()
      if (onCallEnd) onCallEnd(data.status)
    }
  })

  const cleanup = () => {
    isEnded = true
    if (unsubCall) unsubCall()
    if (unsubCallerCandidates) unsubCallerCandidates()
    if (localStream) {
      localStream.getTracks().forEach((t) => t.stop())
    }
    try {
      pc.close()
    } catch (e) {}
  }

  const endCall = async () => {
    try {
      await updateDoc(callDoc, {
        status: 'ended',
        endedAt: serverTimestamp()
      })
    } catch (e) {}
    cleanup()
    if (onCallEnd) onCallEnd('ended')
  }

  const toggleMic = (enabled) => {
    if (localStream) {
      localStream.getAudioTracks().forEach((track) => {
        track.enabled = enabled
      })
    }
  }

  const toggleCam = (enabled) => {
    if (localStream) {
      localStream.getVideoTracks().forEach((track) => {
        track.enabled = enabled
      })
    }
  }

  return {
    callId,
    pc,
    localStream,
    remoteStream,
    isEnded: () => isEnded,
    endCall,
    toggleMic,
    toggleCam
  }
}

/**
 * Declines an incoming call
 */
export async function declineCall(callId) {
  try {
    await updateDoc(doc(db, 'calls', callId), {
      status: 'declined',
      endedAt: serverTimestamp()
    })
  } catch (err) {
    console.error('Error declining call:', err)
  }
}
