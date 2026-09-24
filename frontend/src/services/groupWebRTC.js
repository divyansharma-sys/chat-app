// Group WebRTC Mesh Calling Service with Firebase Firestore Signaling
import { db } from '../firebase'
import {
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  addDoc,
  getDoc,
  serverTimestamp,
  query,
  where,
  arrayUnion,
  arrayRemove
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
 * Listen for any active group call in a specific group chat
 */
export function listenForGroupActiveCall(chatId, onCallStateChange) {
  if (!chatId) return () => {}
  // Query only by chatId to avoid requiring composite indexes in Firestore
  const q = query(
    collection(db, 'groupCalls'),
    where('chatId', '==', chatId)
  )

  return onSnapshot(q, (snapshot) => {
    if (snapshot.empty) {
      onCallStateChange(null)
      return
    }
    const activeCalls = snapshot.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((c) => c.status === 'active')

    if (activeCalls.length > 0) {
      activeCalls.sort((a, b) => {
        const timeA = a.createdAt?.toMillis?.() || 0
        const timeB = b.createdAt?.toMillis?.() || 0
        return timeB - timeA
      })
      onCallStateChange(activeCalls[0])
    } else {
      onCallStateChange(null)
    }
  }, (err) => {
    console.warn('listenForGroupActiveCall error:', err)
  })
}

/**
 * Start or join a multi-party group call
 */
export async function joinGroupCall({
  callId: existingCallId,
  groupChat,
  currentUser,
  isVideo = true,
  onLocalStream,
  onRemoteStream,
  onRemoteStreamRemoved,
  onParticipantsUpdate,
  onCallEnd
}) {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw new Error('Camera/Microphone access requires HTTPS or localhost. Please ensure you are on https://.')
  }

  let localStream = null
  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: isVideo ? { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' } : false
    })
  } catch (err) {
    console.warn('getUserMedia video/audio failed, attempting audio-only:', err)
    try {
      localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      isVideo = false
    } catch (audioErr) {
      throw new Error('Could not access microphone or camera. Please grant browser permissions.')
    }
  }

  if (onLocalStream) {
    onLocalStream(localStream)
  }

  let callId = existingCallId
  let isHost = false

  // If no existing callId provided, create a new group call document
  if (!callId) {
    isHost = true
    const allMembers = groupChat.participants || []
    const callDocRef = await addDoc(collection(db, 'groupCalls'), {
      chatId: groupChat.id,
      groupName: groupChat.name || 'Group',
      groupPhoto: groupChat.photoURL || null,
      hostUid: currentUser.uid,
      hostName: currentUser.displayName || currentUser.username || currentUser.email?.split('@')[0] || 'User',
      hostPhoto: currentUser.photoURL || null,
      members: allMembers,
      isVideo: Boolean(isVideo),
      status: 'active',
      participantUids: [currentUser.uid],
      declinedUids: [],
      createdAt: serverTimestamp(),
      endedAt: null
    })
    callId = callDocRef.id
  } else {
    // Joining existing call
    try {
      const parentSnap = await getDoc(doc(db, 'groupCalls', callId))
      if (parentSnap.exists()) {
        const d = parentSnap.data()
        if (d.hostUid === currentUser.uid) {
          isHost = true
        }
      }
      await updateDoc(doc(db, 'groupCalls', callId), {
        participantUids: arrayUnion(currentUser.uid),
        status: 'active'
      })
    } catch (e) {
      console.warn('Error updating parent call doc:', e)
    }
  }

  // Register participant in subcollection
  const myParticipantRef = doc(db, 'groupCalls', callId, 'participants', currentUser.uid)
  await setDoc(myParticipantRef, {
    uid: currentUser.uid,
    name: currentUser.displayName || currentUser.username || currentUser.email?.split('@')[0] || 'User',
    email: currentUser.email || '',
    photoURL: currentUser.photoURL || null,
    isMuted: false,
    isCamOff: !isVideo,
    joinedAt: Date.now()
  })

  // WebRTC mesh state
  const peers = {} // remoteUid -> { pc, isRemoteDescSet, candidateQueue }
  const remoteStreams = {} // remoteUid -> MediaStream
  const processedSignals = new Set()
  const unsubscribers = []
  let screenStream = null
  let isSharingScreen = false

  const signalsRef = collection(db, 'groupCalls', callId, 'signals')
  const participantsRef = collection(db, 'groupCalls', callId, 'participants')
  const callDocRef = doc(db, 'groupCalls', callId)

  // Helper to create PeerConnection for a remote participant
  const createPeerConnection = (remoteUid) => {
    if (peers[remoteUid]) return peers[remoteUid].pc

    const pc = new RTCPeerConnection(rtcConfig)
    const peerObj = {
      pc,
      isRemoteDescSet: false,
      candidateQueue: []
    }
    peers[remoteUid] = peerObj

    // Add local tracks to PC
    if (localStream) {
      localStream.getTracks().forEach((track) => {
        pc.addTrack(track, localStream)
      })
    }

    // ICE Candidate handler
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        addDoc(signalsRef, {
          senderUid: currentUser.uid,
          receiverUid: remoteUid,
          type: 'candidate',
          candidate: event.candidate.toJSON(),
          createdAt: Date.now()
        }).catch((e) => console.warn('Signal candidate write error:', e))
      }
    }

    // Remote Track handler
    pc.ontrack = (event) => {
      let stream = remoteStreams[remoteUid]
      if (!stream) {
        stream = new MediaStream()
        remoteStreams[remoteUid] = stream
      }

      if (event.streams && event.streams[0]) {
        event.streams[0].getTracks().forEach((track) => {
          if (!stream.getTracks().some((t) => t.id === track.id)) {
            stream.addTrack(track)
          }
        })
      } else if (event.track) {
        if (!stream.getTracks().some((t) => t.id === event.track.id)) {
          stream.addTrack(event.track)
        }
      }

      if (onRemoteStream) {
        onRemoteStream(remoteUid, stream)
      }
    }

    pc.onconnectionstatechange = () => {
      console.log(`[Group WebRTC] PC state with ${remoteUid}:`, pc.connectionState)
      if (['failed', 'closed'].includes(pc.connectionState)) {
        try {
          peers[remoteUid]?.pc?.close()
        } catch (e) {}
        delete peers[remoteUid]
        delete remoteStreams[remoteUid]
        if (onRemoteStreamRemoved) {
          onRemoteStreamRemoved(remoteUid)
        }
      }
    }

    return pc
  }

  // Helper to initiate WebRTC offer to remote participant (deterministic tie-breaker)
  const initiateOffer = async (remoteUid) => {
    try {
      const pc = createPeerConnection(remoteUid)
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)

      await addDoc(signalsRef, {
        senderUid: currentUser.uid,
        receiverUid: remoteUid,
        type: 'offer',
        sdp: { type: offer.type, sdp: offer.sdp },
        createdAt: Date.now()
      })
    } catch (err) {
      console.error(`[Group WebRTC] Error initiating offer to ${remoteUid}:`, err)
    }
  }

  let hadConnectedRemote = false

  // 1. Listen for participant list updates
  const unsubParticipants = onSnapshot(participantsRef, async (snapshot) => {
    const participantList = []
    const currentRemoteUids = new Set()

    snapshot.forEach((snap) => {
      const data = snap.data()
      participantList.push(data)
      if (data.uid !== currentUser.uid) {
        currentRemoteUids.add(data.uid)
      }
    })

    if (currentRemoteUids.size > 0) {
      hadConnectedRemote = true
    } else if (hadConnectedRemote && currentRemoteUids.size === 0) {
      console.log('[Group WebRTC] All remote participants left the call')
      updateDoc(callDocRef, {
        status: 'ended',
        endedAt: serverTimestamp(),
        endReason: 'participants_left',
        participantUids: []
      }).catch(e => console.warn('Error ending call when remote left:', e))
      cleanup()
      if (onCallEnd) onCallEnd('ended')
      return
    }

    if (onParticipantsUpdate) {
      onParticipantsUpdate(participantList)
    }

    // For each remote participant:
    for (const p of participantList) {
      if (p.uid === currentUser.uid) continue

      if (!peers[p.uid]) {
        createPeerConnection(p.uid)

        // Deterministic rule: The user with the greater UID initiates the offer
        if (currentUser.uid > p.uid) {
          console.log(`[Group WebRTC] Initiating offer to ${p.uid} (${currentUser.uid} > ${p.uid})`)
          await initiateOffer(p.uid)
        } else {
          console.log(`[Group WebRTC] Waiting for offer from ${p.uid} (${currentUser.uid} < ${p.uid})`)
        }
      }
    }

    // Check for any participants who left
    Object.keys(peers).forEach((uid) => {
      if (!currentRemoteUids.has(uid)) {
        console.log(`[Group WebRTC] Remote participant left: ${uid}`)
        try {
          peers[uid].pc.close()
        } catch (e) {}
        delete peers[uid]
        delete remoteStreams[uid]
        if (onRemoteStreamRemoved) {
          onRemoteStreamRemoved(uid)
        }
      }
    })
  })
  unsubscribers.push(unsubParticipants)

  // 2. Listen for incoming signals directed to me
  const qSignals = query(signalsRef, where('receiverUid', '==', currentUser.uid))
  const unsubSignals = onSnapshot(qSignals, (snapshot) => {
    snapshot.docChanges().forEach(async (change) => {
      if (change.type === 'added') {
        const signalDocId = change.doc.id
        if (processedSignals.has(signalDocId)) return
        processedSignals.add(signalDocId)

        const signal = change.doc.data()
        const { senderUid, type } = signal

        if (type === 'offer') {
          console.log(`[Group WebRTC] Received offer from ${senderUid}`)
          const pc = createPeerConnection(senderUid)
          const peer = peers[senderUid]

          try {
            await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp))
            peer.isRemoteDescSet = true

            // Flush queued candidates
            while (peer.candidateQueue.length > 0) {
              const cand = peer.candidateQueue.shift()
              try {
                await pc.addIceCandidate(cand)
              } catch (e) {
                console.warn('Queued ICE add error:', e)
              }
            }

            const answer = await pc.createAnswer()
            await pc.setLocalDescription(answer)

            await addDoc(signalsRef, {
              senderUid: currentUser.uid,
              receiverUid: senderUid,
              type: 'answer',
              sdp: { type: answer.type, sdp: answer.sdp },
              createdAt: Date.now()
            })
          } catch (err) {
            console.error('Error handling offer signal:', err)
          }
        } else if (type === 'answer') {
          console.log(`[Group WebRTC] Received answer from ${senderUid}`)
          const peer = peers[senderUid]
          if (peer && peer.pc) {
            try {
              await peer.pc.setRemoteDescription(new RTCSessionDescription(signal.sdp))
              peer.isRemoteDescSet = true

              while (peer.candidateQueue.length > 0) {
                const cand = peer.candidateQueue.shift()
                try {
                  await peer.pc.addIceCandidate(cand)
                } catch (e) {
                  console.warn('Queued ICE add error:', e)
                }
              }
            } catch (err) {
              console.error('Error handling answer signal:', err)
            }
          }
        } else if (type === 'candidate') {
          const peer = peers[senderUid]
          if (peer) {
            const candidate = new RTCIceCandidate(signal.candidate)
            if (peer.isRemoteDescSet && peer.pc.remoteDescription && peer.pc.remoteDescription.type) {
              try {
                await peer.pc.addIceCandidate(candidate)
              } catch (err) {
                console.warn('Error adding ICE candidate:', err)
              }
            } else {
              peer.candidateQueue.push(candidate)
            }
          }
        }
      }
    })
  })
  unsubscribers.push(unsubSignals)

  // 3. Listen to parent call document to detect when call is ended or declined
  const unsubCallDoc = onSnapshot(callDocRef, (snap) => {
    if (!snap.exists()) return
    const callData = snap.data()
    if (callData.status === 'ended') {
      cleanup()
      if (onCallEnd) onCallEnd('ended')
      return
    }

    // Check if other invited members declined the call
    const groupParticipants = groupChat?.participants || callData.members || []
    const otherMembers = groupParticipants.filter((uid) => uid !== currentUser.uid)
    const declined = callData.declinedUids || []

    if (isHost && otherMembers.length > 0 && otherMembers.every((uid) => declined.includes(uid))) {
      console.log('[Group WebRTC] All invited members declined the call')
      updateDoc(callDocRef, {
        status: 'ended',
        endedAt: serverTimestamp(),
        endReason: 'declined',
        participantUids: []
      }).catch(e => console.warn('Error marking call ended on decline:', e))
      cleanup()
      if (onCallEnd) onCallEnd('declined')
      return
    }
  })
  unsubscribers.push(unsubCallDoc)

  // Cleanup all local resources
  const cleanup = () => {
    unsubscribers.forEach((unsub) => {
      try {
        unsub()
      } catch (e) {}
    })

    if (screenStream) {
      screenStream.getTracks().forEach((t) => t.stop())
      screenStream = null
    }

    if (localStream) {
      localStream.getTracks().forEach((t) => t.stop())
      localStream = null
    }

    Object.values(peers).forEach((p) => {
      try {
        p.pc.close()
      } catch (e) {}
    })

    // Remove local participant record & update participantUids
    try {
      deleteDoc(myParticipantRef).catch(() => {})
      updateDoc(callDocRef, {
        participantUids: arrayRemove(currentUser.uid)
      }).catch(() => {})
    } catch (e) {}
  }

  // Leave call (single participant leaves)
  const leaveCall = async () => {
    try {
      await deleteDoc(myParticipantRef)
      await updateDoc(callDocRef, {
        participantUids: arrayRemove(currentUser.uid)
      })

      // Check if room is now empty or host left
      const remainingSnap = await getDoc(callDocRef)
      if (remainingSnap.exists()) {
        const remData = remainingSnap.data()
        const remainingUids = remData.participantUids || []
        if (isHost || remainingUids.length === 0) {
          await updateDoc(callDocRef, {
            status: 'ended',
            endedAt: serverTimestamp(),
            endReason: 'host_left'
          })
        }
      }
    } catch (e) {
      console.warn('Error on leaveCall:', e)
    }

    cleanup()
    if (onCallEnd) onCallEnd('left')
  }

  // End call for everyone (host action)
  const endCallForEveryone = async () => {
    try {
      await updateDoc(callDocRef, {
        status: 'ended',
        endedAt: serverTimestamp()
      })
      await deleteDoc(myParticipantRef)
    } catch (e) {
      console.warn('Error ending call for everyone:', e)
    }

    cleanup()
    if (onCallEnd) onCallEnd('ended')
  }

  // Toggle Microphone
  const toggleMic = async (enabled) => {
    if (localStream) {
      localStream.getAudioTracks().forEach((track) => {
        track.enabled = enabled
      })
    }
    try {
      await updateDoc(myParticipantRef, { isMuted: !enabled })
    } catch (e) {}
  }

  // Toggle Camera
  const toggleCam = async (enabled) => {
    if (localStream) {
      localStream.getVideoTracks().forEach((track) => {
        track.enabled = enabled
      })
    }
    try {
      await updateDoc(myParticipantRef, { isCamOff: !enabled })
    } catch (e) {}
  }

  // Toggle Screen Sharing
  const toggleScreenShare = async () => {
    if (isSharingScreen) {
      // Revert back to camera track
      if (screenStream) {
        screenStream.getTracks().forEach((t) => t.stop())
        screenStream = null
      }
      isSharingScreen = false

      const camTrack = localStream?.getVideoTracks()[0]
      if (camTrack) {
        Object.values(peers).forEach((p) => {
          const sender = p.pc.getSenders().find((s) => s.track && s.track.kind === 'video')
          if (sender) {
            sender.replaceTrack(camTrack).catch((e) => console.warn(e))
          }
        })
      }
      if (onLocalStream && localStream) {
        onLocalStream(localStream)
      }
      return false
    } else {
      // Start screen sharing
      try {
        screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
        isSharingScreen = true

        const screenTrack = screenStream.getVideoTracks()[0]
        screenTrack.onended = () => {
          toggleScreenShare().catch(() => {})
        }

        Object.values(peers).forEach((p) => {
          const sender = p.pc.getSenders().find((s) => s.track && s.track.kind === 'video')
          if (sender) {
            sender.replaceTrack(screenTrack).catch((e) => console.warn(e))
          }
        })

        if (onLocalStream) {
          onLocalStream(screenStream)
        }
        return true
      } catch (err) {
        console.warn('Screen sharing cancelled or failed:', err)
        return false
      }
    }
  }

  return {
    callId,
    isHost,
    localStream,
    remoteStreams,
    toggleMic,
    toggleCam,
    toggleScreenShare,
    leaveCall,
    endCallForEveryone
  }
}
