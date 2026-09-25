import React, { useState, useEffect, useRef } from 'react'
import { auth, db, storage } from '../firebase'
import { collection, query, orderBy, limit, onSnapshot, addDoc, serverTimestamp, where, getDocs, getDoc, doc, updateDoc, deleteDoc, setDoc, increment, writeBatch, deleteField, arrayUnion } from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { LogOut, Send, Settings, Search, User, UserPlus, UserMinus, Check, X, MessageSquare, ChevronLeft, Camera, Palette, CheckCheck, Info, Bell, BellOff, Paperclip, Image as ImageIcon, FileText, Download, Loader2, Trash2, CheckSquare, Square, MoreVertical, Sparkles, Mail, Copy, Maximize2, Phone, Video, Mic, Lock, ShieldCheck, Users, PhoneCall, PhoneOff, AlertCircle, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { getOrGenerateKeyPair, getSharedKey, encryptData, decryptData, importGroupKey } from '../crypto/e2ee'
import { startCall, answerCall, declineCall } from '../services/webrtc'
import { joinGroupCall, listenForGroupActiveCall } from '../services/groupWebRTC'
import VoiceRecorder from './chat/VoiceRecorder'
import AudioMessageBubble from './chat/AudioMessageBubble'
import IncomingCallDialog from './calls/IncomingCallDialog'
import CallModal from './calls/CallModal'
import GroupCallModal from './calls/GroupCallModal'
import CreateGroupModal from './modals/CreateGroupModal'
import GroupInfoModal from './modals/GroupInfoModal'
import { App } from '@capacitor/app'
export default function ChatLayout({ user }) {
  const [messages, setMessages] = useState([])
  const [newMessage, setNewMessage] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [isSearching, setIsSearching] = useState(false)
  const [sentRequests, setSentRequests] = useState(new Set())

  const [incomingRequests, setIncomingRequests] = useState([])
  const [chats, setChats] = useState([])
  const [currentChat, setCurrentChat] = useState(null)

  // E2EE state
  const [myPrivateKey, setMyPrivateKey] = useState(null)
  const [myPublicKeyJwk, setMyPublicKeyJwk] = useState(null)
  const [decryptedMap, setDecryptedMap] = useState({}) // { [msgId]: { text, fileUrl } }

  // WebRTC Call state
  const [activeCallSession, setActiveCallSession] = useState(null)
  const [incomingCall, setIncomingCall] = useState(null)
  const [activeGroupCallSession, setActiveGroupCallSession] = useState(null)
  const [activeGroupCallForChat, setActiveGroupCallForChat] = useState(null)
  const [activeGroupCalls, setActiveGroupCalls] = useState({})
  const dismissedCallsRef = useRef(new Set())

  // In-app Webpage Toast Notification state
  const [toast, setToast] = useState(null) // { message, type: 'info' | 'error' | 'success' | 'call-declined' | 'warning', id }
  const appToastTimeoutRef = useRef(null)

  const showToast = (message, type = 'info', duration = 3500) => {
    if (appToastTimeoutRef.current) clearTimeout(appToastTimeoutRef.current)
    setToast({ message, type, id: Date.now() })
    appToastTimeoutRef.current = setTimeout(() => {
      setToast(null)
    }, duration)
  }

  // Voice Note state
  const [isRecordingVoice, setIsRecordingVoice] = useState(false)

  // Group Chat Modals
  const [showCreateGroupModal, setShowCreateGroupModal] = useState(false)
  const [showGroupInfoModal, setShowGroupInfoModal] = useState(false)

  // Profile settings state
  const [showProfileModal, setShowProfileModal] = useState(false)
  const [viewProfileUser, setViewProfileUser] = useState(null)
  const [fullScreenPhoto, setFullScreenPhoto] = useState(null)
  const [profileBio, setProfileBio] = useState('')
  const [profileUsername, setProfileUsername] = useState('')
  const [usernameError, setUsernameError] = useState('')
  const [profilePhoto, setProfilePhoto] = useState('')
  const [usersMap, setUsersMap] = useState({}) // { uid: { email, bio, photoURL } }
  const [copiedEmail, setCopiedEmail] = useState(false)
  
  // Theme settings state
  const [themeModalTarget, setThemeModalTarget] = useState(null)
  const [messageReadInfo, setMessageReadInfo] = useState(null)
  const [modalThemeColor, setModalThemeColor] = useState('light')
  const [modalBgImage, setModalBgImage] = useState('')
  const [modalBgSize, setModalBgSize] = useState('cover')
  const [modalBgPosition, setModalBgPosition] = useState('center')
  const [modalBgPosX, setModalBgPosX] = useState(50)
  const [modalBgPosY, setModalBgPosY] = useState(50)
  const [globalApplyScope, setGlobalApplyScope] = useState('all') // 'all' (All Screens) | 'remaining' (Remaining Screens without custom theme)

  const parseBgPosition = (posStr) => {
    if (!posStr) return { x: 50, y: 50 }
    const str = String(posStr).trim().toLowerCase()
    if (str === 'center') return { x: 50, y: 50 }
    if (str === 'top' || str === 'center top' || str === 'top center') return { x: 50, y: 0 }
    if (str === 'bottom' || str === 'center bottom' || str === 'bottom center') return { x: 50, y: 100 }
    if (str === 'left' || str === 'left center' || str === 'center left') return { x: 0, y: 50 }
    if (str === 'right' || str === 'right center' || str === 'center right') return { x: 100, y: 50 }
    
    const match = str.match(/(\d+)%\s+(\d+)%/)
    if (match) {
      return {
        x: Math.max(0, Math.min(100, parseInt(match[1], 10))),
        y: Math.max(0, Math.min(100, parseInt(match[2], 10)))
      }
    }
    return { x: 50, y: 50 }
  }

  const updatePosition = (x, y) => {
    const clampedX = Math.max(0, Math.min(100, Math.round(x)))
    const clampedY = Math.max(0, Math.min(100, Math.round(y)))
    setModalBgPosX(clampedX)
    setModalBgPosY(clampedY)
    setModalBgPosition(`${clampedX}% ${clampedY}%`)
  }

  // Attachment & Media states
  const [stagedAttachment, setStagedAttachment] = useState(null)
  const [isUploading, setIsUploading] = useState(false)
  const [activeLightbox, setActiveLightbox] = useState(null)
  const imageInputRef = useRef(null)
  const fileInputRef = useRef(null)

  // Delete & Multi-Select states
  const [isSelectMode, setIsSelectMode] = useState(false)
  const [selectedMsgIds, setSelectedMsgIds] = useState(new Set())
  const [deleteModal, setDeleteModal] = useState(null) // null | { type: 'single', msg } | { type: 'multiple', count } | { type: 'all' }
  const [isDeleting, setIsDeleting] = useState(false)

  // Chat Header 3-dot menu state
  const [showChatMenu, setShowChatMenu] = useState(false)
  const chatMenuRef = useRef(null)

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (chatMenuRef.current && !chatMenuRef.current.contains(e.target)) {
        setShowChatMenu(false)
      }
    }
    if (showChatMenu) {
      document.addEventListener('pointerdown', handleClickOutside)
    }
    return () => {
      document.removeEventListener('pointerdown', handleClickOutside)
    }
  }, [showChatMenu])

  // Notification states & refs
  const [notifPermission, setNotifPermission] = useState(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      return Notification.permission
    }
    return 'denied'
  })
  const [dismissNotifBanner, setDismissNotifBanner] = useState(false)
  const [inAppToast, setInAppToast] = useState(null)

  // Global notifications toggle (default: true)
  const [globalNotifications, setGlobalNotifications] = useState(() => {
    const saved = localStorage.getItem(`global_notif_${user.uid}`)
    return saved !== null ? saved === 'true' : true
  })

  // Per-person/chat muted set: { [chatId]: true }
  const [mutedChats, setMutedChats] = useState(() => {
    try {
      const saved = localStorage.getItem(`muted_chats_${user.uid}`)
      return saved ? JSON.parse(saved) : {}
    } catch {
      return {}
    }
  })

  const isChatMuted = (chatId) => {
    return Boolean(chatId && mutedChats[chatId])
  }

  // Local theme state for instant response
  const [localThemeSettings, setLocalThemeSettings] = useState(() => {
    try {
      const saved = localStorage.getItem(`chatflow_theme_${user?.uid}`)
      return saved ? JSON.parse(saved) : {}
    } catch {
      return {}
    }
  })

  const globalThemeSettings = React.useMemo(() => {
    const dbSettings = usersMap[user?.uid]?.themeSettings || {}
    const globalSettings = { ...(dbSettings.global || {}), ...(localThemeSettings?.global || {}) }
    if (Object.keys(globalSettings).length > 0) {
      return globalSettings
    }
    return dbSettings.themeColor ? dbSettings : (localThemeSettings || {})
  }, [usersMap, user?.uid, localThemeSettings])

  const globalThemeColor = globalThemeSettings.themeColor || 'light'

  // Document & Sidebar theme: ALWAYS follows global theme (or global modal live preview)
  const activeDocumentTheme = (themeModalTarget === 'global') ? modalThemeColor : globalThemeColor

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', activeDocumentTheme)
    document.body.setAttribute('data-theme', activeDocumentTheme)
  }, [activeDocumentTheme])

  // Chat-specific settings (or fallback to global settings)
  const chatSettings = React.useMemo(() => {
    const dbSettings = usersMap[user?.uid]?.themeSettings || {}
    const perChatSettings = (localThemeSettings && localThemeSettings.perChat !== undefined)
      ? localThemeSettings.perChat
      : (dbSettings.perChat || {})

    if (currentChat && perChatSettings[currentChat.id]) {
      return perChatSettings[currentChat.id]
    }
    return globalThemeSettings
  }, [usersMap, user?.uid, currentChat, localThemeSettings, globalThemeSettings])

  const hasCustomChatTheme = Boolean(
    currentChat && (
      (localThemeSettings?.perChat && localThemeSettings.perChat[currentChat.id]) ||
      (usersMap[user?.uid]?.themeSettings?.perChat && usersMap[user?.uid]?.themeSettings?.perChat[currentChat.id])
    )
  )

  const isCurrentChatPreviewing = themeModalTarget === 'chat' || 
    (themeModalTarget === 'global' && (globalApplyScope === 'all' || !hasCustomChatTheme))

  const activeChatThemeColor = isCurrentChatPreviewing
    ? modalThemeColor
    : (chatSettings.themeColor || globalThemeColor)

  const bgImage = chatSettings.bgImage || globalThemeSettings.bgImage || ''
  const bgSize = chatSettings.bgSize || globalThemeSettings.bgSize || 'cover'
  const bgPosition = chatSettings.bgPosition || globalThemeSettings.bgPosition || 'center'

  const previewBgImage = isCurrentChatPreviewing
    ? modalBgImage 
    : (chatSettings.bgImage || globalThemeSettings.bgImage || '')

  const previewBgSize = isCurrentChatPreviewing
    ? modalBgSize 
    : (chatSettings.bgSize || globalThemeSettings.bgSize || 'cover')

  const previewBgPosition = isCurrentChatPreviewing
    ? `${modalBgPosX}% ${modalBgPosY}%` 
    : (chatSettings.bgPosition || globalThemeSettings.bgPosition || 'center')

  const messageStreamRef = useRef(null)
  const previousChatsRef = useRef({})
  const chatInputRef = useRef(null)
  const audioCtxRef = useRef(null)
  const titleFlashIntervalRef = useRef(null)
  const toastTimeoutRef = useRef(null)
  const lastNotifiedRef = useRef({ text: '', time: 0 })
  const isInitialChatsLoadRef = useRef(true)
  const isInitialMessagesLoadRef = useRef(true)
  const currentChatRef = useRef(currentChat)
  const typingTimeoutRef = useRef(null)
  const isTypingRef = useRef(false)
  const lastMsgTapRef = useRef({ id: null, time: 0 })

  // Double-tap or double-click to view message information
  const handleMessageBubbleClick = (msg, computedStatus) => {
    if (isSelectMode) {
      handleToggleSelectMessage(msg.id)
      return
    }

    const now = Date.now()
    const lastTap = lastMsgTapRef.current
    if (lastTap.id === msg.id && (now - lastTap.time) < 350) {
      // Double tap detected! Open message info
      setMessageReadInfo({ ...msg, computedStatus })
      lastMsgTapRef.current = { id: null, time: 0 }
    } else {
      lastMsgTapRef.current = { id: msg.id, time: now }
    }
  }

  const handleMessageBubbleDoubleClick = (msg, computedStatus) => {
    if (isSelectMode) return
    setMessageReadInfo({ ...msg, computedStatus })
  }

  useEffect(() => {
    currentChatRef.current = currentChat
    isInitialMessagesLoadRef.current = true

    // Clear typing indicator on previous chat if any
    return () => {
      if (currentChat && isTypingRef.current) {
        isTypingRef.current = false
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
        updateDoc(doc(db, 'chats', currentChat.id), {
          [`typing.${user.uid}`]: false
        }).catch(() => {})
      }
    }
  }, [currentChat])

  // Online status helper: user is online ONLY if marked online AND heartbeat is active (within last 20s)
  const isUserOnline = (userData) => {
    if (!userData) return false
    if (userData.uid === user?.uid) return true
    if (userData.online !== true) return false
    if (userData.lastSeen?.toMillis) {
      return (Date.now() - userData.lastSeen.toMillis()) < 20 * 1000
    }
    return false
  }

  // Message status helper:
  // 'read' (double blue tick): ONLY when recipient has actually read the message (marked as read)
  // 'delivered' (double grey tick): recipient's data is ON (online) or marked delivered, but NOT read yet
  // 'sent' (single grey tick): recipient is offline & data is off
  const getMessageStatus = (msg, otherUserData) => {
    // 1. Double blue tick ONLY if msg has actually been read by recipient!
    if (msg.status === 'read' || msg.readAt) {
      return 'read'
    }

    // 2. Double grey tick if delivered or recipient's data is ON (online), but NOT read
    if (msg.status === 'delivered' || msg.deliveredAt || isUserOnline(otherUserData)) {
      return 'delivered'
    }

    // 3. Single grey tick if recipient is offline and data is off
    return 'sent'
  }

  // Get visible chat preview data for current user (respecting clearedAt and deleted messages)
  const getChatPreviewData = (chat) => {
    if (!chat) return null
    const userClearedTime = chat.clearedAt?.[user.uid]?.toMillis?.() || 0
    const globalLastMsgTime = chat.lastMessageTime?.toMillis?.() || 0

    // User-specific last message override (from deleting messages for self)
    if (chat.userLastMessage?.[user.uid] !== undefined) {
      const override = chat.userLastMessage[user.uid]
      if (!override || !override.text) return null
      return override
    }

    // Chat cleared for this user and no newer message has been sent
    if (userClearedTime > 0 && globalLastMsgTime <= userClearedTime) {
      return null
    }

    if (!chat.lastMessage) return null

    return {
      text: chat.lastMessage,
      sender: chat.lastMessageSender,
      time: chat.lastMessageTime,
      status: chat.lastMessageStatus
    }
  }

  // Chat sidebar last message status helper
  const getChatLastMessageStatus = (chat, previewData) => {
    const status = previewData?.status || chat.lastMessageStatus
    // ONLY double blue tick if chat's last message is explicitly marked read by recipient
    if (status === 'read') {
      return 'read'
    }

    const otherUserData = usersMap[chat.otherUid]
    // Double grey tick if delivered or recipient is online (data on)
    if (status === 'delivered' || isUserOnline(otherUserData)) {
      return 'delivered'
    }

    // Single grey tick if offline & data is off
    return 'sent'
  }

  const formatLastSeen = (timestamp) => {
    if (!timestamp) return 'Offline'
    try {
      const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp)
      const diffSeconds = Math.floor((Date.now() - date.getTime()) / 1000)
      if (diffSeconds < 60) return 'Active just now'
      if (diffSeconds < 3600) return `Last seen ${Math.floor(diffSeconds / 60)}m ago`
      if (diffSeconds < 86400) return `Last seen ${Math.floor(diffSeconds / 3600)}h ago`
      return `Last seen ${date.toLocaleDateString([], { month: 'short', day: 'numeric' })}`
    } catch (e) {
      return 'Offline'
    }
  }

  // Manage Online Status
  useEffect(() => {
    if (!user?.uid) return
    const userRef = doc(db, 'users', user.uid)

    const setOnline = async (isOnline) => {
      try {
        await setDoc(userRef, {
          uid: user.uid,
          email: user.email,
          online: isOnline,
          lastSeen: serverTimestamp()
        }, { merge: true })
      } catch (err) {
        console.error('Error updating online status:', err)
      }
    }

    // Mark online immediately when opening web app
    setOnline(true)

    // Keep active with a 6s heartbeat while tab is visible
    const heartbeat = setInterval(() => {
      if (document.visibilityState === 'visible') {
        setOnline(true)
      }
    }, 6000)

    // Update on user activity (throttled)
    let lastActivity = 0
    const onUserActivity = () => {
      const now = Date.now()
      if (now - lastActivity > 6000) {
        lastActivity = now
        if (document.visibilityState === 'visible') {
          setOnline(true)
        }
      }
    }

    // Immediately mark offline when tab is hidden, minimized, or closed
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        setOnline(true)
      } else {
        setOnline(false)
      }
    }

    const handleBeforeUnload = () => {
      setOnline(false)
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('beforeunload', handleBeforeUnload)
    window.addEventListener('pagehide', handleBeforeUnload)
    window.addEventListener('pointerdown', onUserActivity)
    window.addEventListener('keydown', onUserActivity)
    window.addEventListener('focus', onUserActivity)

    return () => {
      clearInterval(heartbeat)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('beforeunload', handleBeforeUnload)
      window.removeEventListener('pagehide', handleBeforeUnload)
      window.removeEventListener('pointerdown', onUserActivity)
      window.removeEventListener('keydown', onUserActivity)
      window.removeEventListener('focus', onUserActivity)
    }
  }, [user.uid])

  // In-memory WAV chime generator for 100% reliable audio playback across all browsers
  const chimeSoundUrlRef = useRef(null)

  useEffect(() => {
    try {
      const sampleRate = 22050
      const duration = 0.3
      const numSamples = Math.floor(sampleRate * duration)
      const buffer = new ArrayBuffer(44 + numSamples * 2)
      const view = new DataView(buffer)

      const writeStr = (offset, str) => {
        for (let i = 0; i < str.length; i++) {
          view.setUint8(offset + i, str.charCodeAt(i))
        }
      }

      writeStr(0, 'RIFF')
      view.setUint32(4, 36 + numSamples * 2, true)
      writeStr(8, 'WAVE')
      writeStr(12, 'fmt ')
      view.setUint32(16, 16, true)
      view.setUint16(20, 1, true)
      view.setUint16(22, 1, true)
      view.setUint32(24, sampleRate, true)
      view.setUint32(28, sampleRate * 2, true)
      view.setUint16(32, 2, true)
      view.setUint16(34, 16, true)
      writeStr(36, 'data')
      view.setUint32(40, numSamples * 2, true)

      for (let i = 0; i < numSamples; i++) {
        const t = i / sampleRate
        const env = Math.max(0, 1 - (t / duration)) * Math.min(1, t / 0.008)
        let s = 0
        if (t < 0.16) s += Math.sin(2 * Math.PI * 659.25 * t) * 0.45
        if (t > 0.07) s += Math.sin(2 * Math.PI * 880 * (t - 0.07)) * 0.55
        const clamped = Math.max(-1, Math.min(1, s * env))
        view.setInt16(44 + i * 2, clamped < 0 ? clamped * 0x8000 : clamped * 0x7FFF, true)
      }

      const blob = new Blob([buffer], { type: 'audio/wav' })
      chimeSoundUrlRef.current = URL.createObjectURL(blob)
    } catch (e) {
      console.warn('WAV chime generation notice:', e)
    }
  }, [])

  // Unlock AudioContext upon user gesture
  const getAudioContext = () => {
    if (!audioCtxRef.current && (window.AudioContext || window.webkitAudioContext)) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext
      audioCtxRef.current = new AudioContextClass()
    }
    if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume().catch(() => {})
    }
    return audioCtxRef.current
  }

  useEffect(() => {
    const unlockAudio = () => {
      getAudioContext()
    }
    window.addEventListener('click', unlockAudio, { once: true })
    window.addEventListener('keydown', unlockAudio, { once: true })
    window.addEventListener('touchstart', unlockAudio, { once: true })
    return () => {
      window.removeEventListener('click', unlockAudio)
      window.removeEventListener('keydown', unlockAudio)
      window.removeEventListener('touchstart', unlockAudio)
    }
  }, [])

  // Play pleasant WhatsApp-style dual chime (HTML5 Audio + Web Audio API fallback)
  const playNotificationSound = () => {
    try {
      if (chimeSoundUrlRef.current) {
        const audio = new Audio(chimeSoundUrlRef.current)
        audio.volume = 0.65
        const playPromise = audio.play()
        if (playPromise !== undefined) {
          playPromise.catch(() => playWebAudioChime())
        }
        return
      }
    } catch {
      // Fallback
    }
    playWebAudioChime()
  }

  const playWebAudioChime = () => {
    try {
      const ctx = getAudioContext()
      if (!ctx) return

      const now = ctx.currentTime
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()

      osc.type = 'sine'
      osc.frequency.setValueAtTime(659.25, now)
      osc.frequency.setValueAtTime(880, now + 0.08)

      gain.gain.setValueAtTime(0.001, now)
      gain.gain.linearRampToValueAtTime(0.2, now + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35)

      osc.connect(gain)
      gain.connect(ctx.destination)

      osc.start(now)
      osc.stop(now + 0.35)
    } catch (err) {
      console.warn('Audio play notice:', err)
    }
  }

  // Toggle all notifications globally (ON / MUTED)
  const toggleGlobalNotifications = async () => {
    const nextState = !globalNotifications
    setGlobalNotifications(nextState)
    localStorage.setItem(`global_notif_${user.uid}`, String(nextState))

    if (nextState) {
      playNotificationSound()
      if ('Notification' in window && Notification.permission === 'default') {
        try {
          const perm = await Notification.requestPermission()
          setNotifPermission(perm)
        } catch (e) {
          console.warn(e)
        }
      }
      setInAppToast({
        senderName: 'Notifications',
        text: 'All notifications are now ON 🔔',
        isSystem: true
      })
      setTimeout(() => setInAppToast(null), 3000)
    } else {
      setInAppToast({
        senderName: 'Notifications',
        text: 'All notifications are now MUTED 🔕',
        isSystem: true
      })
      setTimeout(() => setInAppToast(null), 3000)
    }
  }

  // Toggle notifications for a specific person's chat
  const toggleChatMute = (chatId) => {
    if (!chatId) return
    const friendName = usersMap[currentChat?.otherUid]?.username || currentChat?.otherEmail?.split('@')[0] || 'Friend'
    setMutedChats(prev => {
      const updated = { ...prev }
      if (updated[chatId]) {
        delete updated[chatId]
        playNotificationSound()
        setInAppToast({
          senderName: friendName,
          text: `Notifications unmuted for ${friendName} 🔔`,
          isSystem: true
        })
      } else {
        updated[chatId] = true
        setInAppToast({
          senderName: friendName,
          text: `Notifications muted for ${friendName} 🔕`,
          isSystem: true
        })
      }
      localStorage.setItem(`muted_chats_${user.uid}`, JSON.stringify(updated))
      setTimeout(() => setInAppToast(null), 3000)
      return updated
    })
  }

  // Flash tab title when message arrives in background
  const startTitleFlash = (senderName) => {
    if (titleFlashIntervalRef.current) {
      clearInterval(titleFlashIntervalRef.current)
    }
    let isOriginal = false
    document.title = `🔔 New message from ${senderName}`
    titleFlashIntervalRef.current = setInterval(() => {
      document.title = isOriginal ? `🔔 New message from ${senderName}` : 'ChatFlow'
      isOriginal = !isOriginal
    }, 1200)
  }

  const stopTitleFlash = () => {
    if (titleFlashIntervalRef.current) {
      clearInterval(titleFlashIntervalRef.current)
      titleFlashIntervalRef.current = null
      document.title = 'ChatFlow'
    }
  }

  useEffect(() => {
    const handleFocus = () => stopTitleFlash()
    window.addEventListener('focus', handleFocus)
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        stopTitleFlash()
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      window.removeEventListener('focus', handleFocus)
      document.removeEventListener('visibilitychange', handleVisibility)
      stopTitleFlash()
    }
  }, [])

  // Request browser desktop notification permission
  const requestNotifPermission = async () => {
    if (!('Notification' in window)) {
      showToast('This browser does not support desktop notifications.', 'warning')
      return
    }
    try {
      const permission = await Notification.requestPermission()
      setNotifPermission(permission)
      if (permission === 'granted') {
        setDismissNotifBanner(true)
        playNotificationSound()
        try {
          new Notification('Notifications enabled! 🔔', {
            body: 'You will receive alerts whenever friends message you.',
            icon: '/favicon.ico'
          })
        } catch (e) {
          console.warn(e)
        }
      }
    } catch (err) {
      console.error('Error requesting notification permission:', err)
    }
  }

  // Unified Notification dispatcher
  const notifyIncomingMessage = (chat, text) => {
    if (!chat || !text) return

    // 1. If global notifications are muted, ignore
    if (!globalNotifications) return

    // 2. If this specific person's chat is muted by user, ignore
    if (isChatMuted(chat.id)) return

    const now = Date.now()
    // Avoid double notifications within 1.5s for same message
    if (lastNotifiedRef.current.text === text && (now - lastNotifiedRef.current.time) < 1500) {
      return
    }
    lastNotifiedRef.current = { text, time: now }

    const senderName = usersMap[chat.otherUid]?.username || chat.otherEmail?.split('@')[0] || 'Friend'
    const isThisChatActive = currentChatRef.current?.id === chat.id
    const isAppFocused = document.visibilityState === 'visible' && document.hasFocus()

    // 1. Audio Chime: Always play sound
    playNotificationSound()

    // 2. If user is actively reading this exact conversation, skip visual popups
    if (isThisChatActive && isAppFocused) {
      return
    }

    // 3. Tab is hidden or minimized or unfocused: Desktop notification + Title alert
    if (!isAppFocused) {
      startTitleFlash(senderName)
      if ('Notification' in window && Notification.permission === 'granted') {
        try {
          const n = new Notification(senderName, {
            body: text,
            icon: usersMap[chat.otherUid]?.photoURL || '/favicon.ico',
            tag: chat.id
          })
          n.onclick = () => {
            window.focus()
            handleSelectChat(chat)
            n.close()
          }
        } catch (err) {
          console.warn('Desktop notification failed:', err)
        }
      }
    }

    // 4. In-App Toast: If in app, but on a different chat or looking at sidebar
    if (!isThisChatActive) {
      if (toastTimeoutRef.current) {
        clearTimeout(toastTimeoutRef.current)
      }
      setInAppToast({
        chat,
        senderName,
        senderPhoto: usersMap[chat.otherUid]?.photoURL,
        text
      })
      toastTimeoutRef.current = setTimeout(() => {
        setInAppToast(null)
      }, 5000)
    }
  }

  // Listen to ALL users to enrich profiles across the app
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'users'), (snapshot) => {
      const uMap = {}
      snapshot.forEach(doc => {
        uMap[doc.id] = doc.data()
      })
      setUsersMap(uMap)

      // Update local profile state if it matches current user
      if (uMap[user.uid]) {
        if (!showProfileModal) {
          setProfileBio(uMap[user.uid].bio || '')
          setProfilePhoto(uMap[user.uid].photoURL || '')
        }
      }
    })
    return () => unsubscribe()
  }, [user.uid, showProfileModal])

  // Auto-sync user to db (initial registration guard & E2EE Key Sync)
  useEffect(() => {
    const syncUserAndInitE2EE = async () => {
      try {
        let pubKey = null
        try {
          const keys = await getOrGenerateKeyPair(user.uid)
          setMyPrivateKey(keys.privateKey)
          setMyPublicKeyJwk(keys.publicKeyJwk)
          pubKey = keys.publicKeyJwk
        } catch (cryptoErr) {
          console.warn('E2EE key generation notice:', cryptoErr)
        }

        const userDocRef = doc(db, 'users', user.uid)
        const userDocSnap = await getDoc(userDocRef)
        const existingData = userDocSnap.exists() ? userDocSnap.data() : {}

        const updateData = {
          uid: user.uid,
          email: user.email,
        }
        if (!existingData.username) {
          updateData.username = user.displayName || user.email?.split('@')[0] || `user_${user.uid.slice(0, 5)}`
        }
        if (pubKey) {
          updateData.publicKey = pubKey
        }

        await setDoc(userDocRef, updateData, { merge: true })
      } catch (err) {
        console.error('Error syncing user to DB:', err)
      }
    }
    syncUserAndInitE2EE()
  }, [user])

  // Listen for Incoming WebRTC Calls (1-on-1)
  useEffect(() => {
    if (!user?.uid) return
    const q = query(
      collection(db, 'calls'),
      where('calleeUid', '==', user.uid),
      where('status', '==', 'ringing')
    )
    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (snapshot.empty) {
        setIncomingCall((prev) => (!prev?.isGroup ? null : prev))
        return
      }
      snapshot.docs.forEach((docSnap) => {
        const data = { id: docSnap.id, ...docSnap.data() }
        if (dismissedCallsRef.current.has(data.id)) return
        if (activeCallSession?.callId === data.id) return

        // Active ringing call check: status must be ringing and not ended
        if (data.status === 'ringing' && !data.endedAt) {
          setIncomingCall(data)

          if (document.visibilityState !== 'visible' || !document.hasFocus()) {
            if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
              try {
                const notif = new Notification(`Incoming ${data.type === 'video' ? 'Video' : 'Voice'} Call`, {
                  body: `${data.callerName || 'Someone'} is calling you...`,
                  icon: data.callerPhoto || '/icon.png',
                  tag: data.id
                })
                notif.onclick = () => {
                  window.focus()
                  notif.close()
                }
              } catch (e) {}
            }
          }
        }
      })
    })
    return () => unsubscribe()
  }, [user.uid, activeCallSession?.callId])

  // Sync active group call for currently opened chat
  useEffect(() => {
    if (!currentChat) {
      setActiveGroupCallForChat(null)
      return
    }
    setActiveGroupCallForChat(activeGroupCalls[currentChat.id] || null)
  }, [currentChat?.id, activeGroupCalls])

  // Listen for all active group calls across user's groups
  useEffect(() => {
    if (!user?.uid) return

    const q = query(
      collection(db, 'groupCalls'),
      where('status', '==', 'active')
    )

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const callsByChatId = {}
      const activeCallsList = []

      snapshot.docs.forEach((docSnap) => {
        const data = { id: docSnap.id, ...docSnap.data() }
        const declined = data.declinedUids || []
        const members = data.members || []
        const otherMembers = members.filter((m) => m !== data.hostUid)
        const allDeclined = otherMembers.length > 0 && otherMembers.every((m) => declined.includes(m))
        const pUids = data.participantUids || []

        // A call is stale if created more than 90 seconds ago with 0 or 1 participant and host is not in this session
        const isStaleOldCall = data.createdAt?.toMillis && (Date.now() - data.createdAt.toMillis() > 90000) && pUids.length <= 1 && (!activeGroupCallSession || activeGroupCallSession.callId !== data.id)

        // If call is ended, or all invited members declined, or room has 0 participants, or stale abandoned call
        if (data.status === 'ended' || data.endedAt || allDeclined || pUids.length === 0 || isStaleOldCall) {
          if (data.hostUid === user.uid && data.status === 'active') {
            updateDoc(doc(db, 'groupCalls', data.id), {
              status: 'ended',
              endedAt: serverTimestamp(),
              endReason: allDeclined ? 'declined' : isStaleOldCall ? 'stale' : 'empty',
              participantUids: []
            }).catch(() => {})
          }
          return
        }

        callsByChatId[data.chatId] = data
        activeCallsList.push(data)
      })

      setActiveGroupCalls(callsByChatId)

      // Find if there is an active call in any group the user belongs to
      const myGroupChatIds = chats.filter((c) => c.type === 'group' || c.isGroup).map((c) => c.id)

      const activeGroupCall = activeCallsList.find((call) => {
        if (call.hostUid === user.uid) return false
        if (dismissedCallsRef.current.has(call.id)) return false
        if (call.declinedUids && Array.isArray(call.declinedUids) && call.declinedUids.includes(user.uid)) return false
        if (activeGroupCallSession?.callId === call.id) return false

        const isMember = (call.members && Array.isArray(call.members) && call.members.includes(user.uid)) ||
          myGroupChatIds.includes(call.chatId) ||
          currentChat?.id === call.chatId ||
          chats.some((c) => c.id === call.chatId && (c.participants?.includes(user.uid) || c.type === 'group' || c.isGroup))

        if (!isMember && (call.members?.length > 0 || myGroupChatIds.length > 0)) return false

        // Status is active and call has not ended
        return call.status === 'active' && !call.endedAt
      })

      if (activeGroupCall) {
        const foundGroup = chats.find((c) => c.id === activeGroupCall.chatId) || (currentChat?.id === activeGroupCall.chatId ? currentChat : {
          id: activeGroupCall.chatId,
          type: 'group',
          name: activeGroupCall.groupName,
          photoURL: activeGroupCall.groupPhoto,
          participants: activeGroupCall.members || []
        })

        setIncomingCall({
          id: activeGroupCall.id,
          chatId: activeGroupCall.chatId,
          isGroup: true,
          chatType: 'group',
          groupChat: foundGroup,
          groupName: activeGroupCall.groupName || 'Group',
          groupPhoto: activeGroupCall.groupPhoto || null,
          callerName: activeGroupCall.hostName || 'Group Member',
          callerPhoto: activeGroupCall.hostPhoto || null,
          type: activeGroupCall.isVideo ? 'video' : 'audio',
          createdAt: activeGroupCall.createdAt
        })

        if (document.visibilityState !== 'visible' || !document.hasFocus()) {
          if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
            try {
              const notif = new Notification(`Incoming Group Video Call: ${activeGroupCall.groupName || 'Group'}`, {
                body: `${activeGroupCall.hostName || 'A member'} started a video call. Click to join!`,
                icon: activeGroupCall.groupPhoto || '/icon.png',
                tag: activeGroupCall.id
              })
              notif.onclick = () => {
                window.focus()
                if (foundGroup) setCurrentChat(foundGroup)
                notif.close()
              }
            } catch (e) {}
          }
        }
      } else {
        setIncomingCall((prev) => (prev?.isGroup ? null : prev))
      }
    }, (err) => {
      console.warn('Error listening to groupCalls:', err)
    })

    return () => unsubscribe()
  }, [user.uid, chats, currentChat?.id, activeGroupCallSession?.callId])

  // Listen for Incoming Requests
  useEffect(() => {
    const q = query(
      collection(db, 'requests'),
      where('to', '==', user.uid),
      where('status', '==', 'pending')
    )
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const reqs = []
      snapshot.forEach(doc => reqs.push({ id: doc.id, ...doc.data() }))
      setIncomingRequests(reqs)
    })
    return () => unsubscribe()
  }, [user.uid])

  // Listen for Direct Messages (Chats)
  useEffect(() => {
    const q = query(
      collection(db, 'chats'),
      where('participants', 'array-contains', user.uid)
    )
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const c = []
      const seenKeys = new Set()

      snapshot.forEach(docSnap => {
        const data = docSnap.data()
        const isGroup = data.type === 'group'
        const otherEmail = isGroup ? (data.name || 'Group') : (data.participantEmails?.find(e => e !== user.email) || 'Unknown')
        const otherUid = isGroup ? null : data.participants?.find(p => p !== user.uid)
        const chatKey = isGroup ? docSnap.id : (otherUid || docSnap.id)

        if (!seenKeys.has(chatKey)) {
          seenKeys.add(chatKey)

          const chatData = { id: docSnap.id, otherEmail, otherUid, isGroup, ...data }
          c.push(chatData)

          // Auto-clear unread count if we are currently looking at this chat!
          if (currentChatRef.current && currentChatRef.current.id === chatData.id && chatData.unreadCount?.[user.uid] > 0) {
            updateDoc(doc(db, 'chats', chatData.id), {
              [`unreadCount.${user.uid}`]: 0
            }).catch(e => console.error(e))
          }

          // Check for new notifications
          const prevChat = previousChatsRef.current[docSnap.id]
          if (
            !isInitialChatsLoadRef.current &&
            prevChat &&
            chatData.lastMessage &&
            chatData.lastMessageSender !== user.uid
          ) {
            const prevTime = prevChat.lastMessageTime?.toMillis?.() || 0
            const currTime = chatData.lastMessageTime?.toMillis?.() || 0
            const isNewerTime = currTime > prevTime
            const isDifferentText = chatData.lastMessage !== prevChat.lastMessage

            if (isNewerTime || isDifferentText) {
              notifyIncomingMessage(chatData, chatData.lastMessage)
            }
          }

          // Store current state for future comparisons
          previousChatsRef.current[docSnap.id] = chatData
        }
      })

      isInitialChatsLoadRef.current = false

      // Helper to compute sort time for this user
      const getChatSortTime = (chatItem) => {
        const userClearedTime = chatItem.clearedAt?.[user.uid]?.toMillis?.() || 0
        if (chatItem.userLastMessage?.[user.uid] !== undefined) {
          const override = chatItem.userLastMessage[user.uid]
          return override?.time?.toMillis?.() || 0
        }
        const globalTime = chatItem.lastMessageTime?.toMillis?.() || 0
        if (userClearedTime > 0 && globalTime <= userClearedTime) {
          return 0
        }
        return globalTime
      }

      // Sort chats by most recent message visible to this user
      c.sort((a, b) => {
        const timeA = getChatSortTime(a)
        const timeB = getChatSortTime(b)
        return timeB - timeA
      })

      // Sync active currentChat data
      if (currentChatRef.current) {
        const updatedChat = c.find(item => item.id === currentChatRef.current.id)
        if (updatedChat) {
          setCurrentChat(updatedChat)
        }
      }

      setChats(c)
    })
    return () => unsubscribe()
  }, [user.uid, user.email])

  // Active cleared timestamp for current user in current chat
  const activeChatClearedAt = chats.find(c => c.id === currentChat?.id)?.clearedAt?.[user.uid]?.toMillis?.() || currentChat?.clearedAt?.[user.uid]?.toMillis?.() || 0

  // Listen for Messages in the Current Chat
  useEffect(() => {
    if (!currentChat) {
      setMessages([])
      return
    }

    const q = query(
      collection(db, 'messages'),
      where('chatId', '==', currentChat.id)
    )

    let isInitialMessages = true
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = []
      snapshot.forEach((doc) => {
        msgs.push({ id: doc.id, ...doc.data() })
      })
      // Sort messages chronologically in JavaScript
      msgs.sort((a, b) => {
        const timeA = a.createdAt?.toMillis() || 0
        const timeB = b.createdAt?.toMillis() || 0
        return timeA - timeB
      })

      // Filter messages for current user:
      // 1. Exclude messages deleted by user (deletedBy[user.uid] === true)
      // 2. Exclude messages sent on/before user's clearedAt timestamp for this chat
      const visibleMsgs = msgs.filter((m) => {
        if (m.deletedBy?.[user.uid]) return false
        if (activeChatClearedAt > 0) {
          const msgTime = m.createdAt?.toMillis?.() || 0
          if (msgTime > 0 && msgTime <= activeChatClearedAt) {
            return false
          }
        }
        return true
      })

      // If there are more than 50 messages, only keep the latest 50
      if (visibleMsgs.length > 50) {
        setMessages(visibleMsgs.slice(visibleMsgs.length - 50))
      } else {
        setMessages(visibleMsgs)
      }

      if (isInitialMessages) {
        isInitialMessages = false
      } else {
        snapshot.docChanges().forEach((change) => {
          if (change.type === 'added') {
            const data = change.doc.data()
            if (data.uid !== user.uid && !data.deletedBy?.[user.uid]) {
              notifyIncomingMessage(currentChat, data.text)
            }
          }
        })
      }
    })

    return () => unsubscribe()
  }, [currentChat?.id, user.uid, activeChatClearedAt])

  // Decrypt incoming encrypted messages
  useEffect(() => {
    if (!messages.length || !currentChat) return

    const decryptMessages = async () => {
      const isGroup = currentChat.type === 'group'
      let key = null

      if (isGroup && currentChat.e2eeKeyJwk) {
        try {
          key = await importGroupKey(currentChat.e2eeKeyJwk)
        } catch (e) {
          console.warn('Group key import error:', e)
        }
      } else if (!isGroup && myPrivateKey) {
        const otherUid = currentChat.otherUid
        const otherUser = usersMap[otherUid]
        if (otherUser?.publicKey) {
          key = await getSharedKey(myPrivateKey, otherUser.publicKey, otherUid)
        }
      }

      if (!key) return

      const updates = {}
      for (const m of messages) {
        if (m.isEncrypted && !decryptedMap[m.id]) {
          try {
            let decText = m.text
            let decFileUrl = m.fileUrl
            if (m.text && m.iv) {
              decText = await decryptData(m.text, m.iv, key)
            }
            if (m.fileUrl && m.fileUrlIv) {
              decFileUrl = await decryptData(m.fileUrl, m.fileUrlIv, key)
            }
            updates[m.id] = { text: decText, fileUrl: decFileUrl }
          } catch (decErr) {
            console.warn('Decryption failed for msg', m.id, decErr)
          }
        }
      }

      if (Object.keys(updates).length > 0) {
        setDecryptedMap((prev) => ({ ...prev, ...updates }))
      }
    }

    decryptMessages()
  }, [messages, currentChat?.id, myPrivateKey, usersMap])

  // Auto-mark incoming messages as 'read' when actively viewing the chat
  useEffect(() => {
    if (!currentChat || !messages.length) return
    // CRITICAL: NEVER mark as read if the tab is hidden, minimized, or closed!
    if (document.visibilityState !== 'visible') return

    const unreadMsgs = messages.filter(
      (m) => m.uid !== user?.uid && m.status !== 'read'
    )

    if (unreadMsgs.length > 0) {
      unreadMsgs.forEach((m) => {
        updateDoc(doc(db, 'messages', m.id), {
          status: 'read',
          readAt: serverTimestamp()
        }).catch((err) => console.error('Error marking message read:', err))
      })

      const updates = {
        [`unreadCount.${user.uid}`]: 0
      }
      if (currentChat.lastMessageSender && currentChat.lastMessageSender !== user?.uid) {
        updates.lastMessageStatus = 'read'
      }
      updateDoc(doc(db, 'chats', currentChat.id), updates).catch((err) => console.error('Error updating chat unread status:', err))
    }
  }, [messages, currentChat, user?.uid])

  // Mark unread messages as read when returning to the tab / focusing
  useEffect(() => {
    const handleReadOnFocus = () => {
      if (document.visibilityState === 'visible' && currentChat && messages.length) {
        const unreadMsgs = messages.filter(
          (m) => m.uid !== user?.uid && m.status !== 'read'
        )
        if (unreadMsgs.length > 0) {
          unreadMsgs.forEach((m) => {
            updateDoc(doc(db, 'messages', m.id), {
              status: 'read',
              readAt: serverTimestamp()
            }).catch((err) => console.error('Error marking message read:', err))
          })
          const updates = { [`unreadCount.${user.uid}`]: 0 }
          if (currentChat.lastMessageSender && currentChat.lastMessageSender !== user?.uid) {
            updates.lastMessageStatus = 'read'
          }
          updateDoc(doc(db, 'chats', currentChat.id), updates).catch((err) => console.error(err))
        }
      }
    }
    document.addEventListener('visibilitychange', handleReadOnFocus)
    window.addEventListener('focus', handleReadOnFocus)
    return () => {
      document.removeEventListener('visibilitychange', handleReadOnFocus)
      window.removeEventListener('focus', handleReadOnFocus)
    }
  }, [messages, currentChat, user?.uid])

  // Auto-mark incoming messages sent to me as 'delivered' when I'm online
  useEffect(() => {
    if (!user?.uid) return

    const q = query(
      collection(db, 'messages'),
      where('to', '==', user.uid),
      where('status', '==', 'sent')
    )

    const unsubscribe = onSnapshot(q, (snapshot) => {
      snapshot.forEach((docSnap) => {
        const data = docSnap.data()
        if (data.status === 'sent') {
          updateDoc(doc(db, 'messages', docSnap.id), {
            status: 'delivered',
            deliveredAt: serverTimestamp()
          }).catch((err) => console.error('Error marking delivered:', err))
        }
      })
    }, (error) => {
      console.warn('Delivered listener notice:', error)
    })

    return () => unsubscribe()
  }, [user?.uid])

  // Scroll to bottom of messages safely
  useEffect(() => {
    if (messageStreamRef.current) {
      // Use scrollTop instead of scrollIntoView to prevent the entire mobile page from jumping
      messageStreamRef.current.scrollTop = messageStreamRef.current.scrollHeight
    }
  }, [messages])

  // Search logic - search ONLY by username
  useEffect(() => {
    const searchUsers = async () => {
      const trimmed = searchQuery.trim().toLowerCase()
      if (!trimmed) {
        setSearchResults([])
        setIsSearching(false)
        return
      }

      setIsSearching(true)
      try {
        // Strip leading @ if entered by user (e.g. "@alex" -> "alex")
        const cleanQuery = trimmed.startsWith('@') ? trimmed.slice(1) : trimmed
        if (!cleanQuery) {
          setSearchResults([])
          setIsSearching(false)
          return
        }

        const querySnapshot = await getDocs(collection(db, 'users'))
        const results = []
        querySnapshot.forEach((doc) => {
          const data = doc.data()
          const username = (data.username || '').toLowerCase()
          // Search STRICTLY by username only
          if (username && username.includes(cleanQuery)) {
            results.push(data)
          }
        })
        setSearchResults(results.slice(0, 10))
      } catch (err) {
        console.error('Error searching users:', err)
      } finally {
        setIsSearching(false)
      }
    }

    const delayDebounceFn = setTimeout(() => {
      searchUsers()
    }, 150)

    return () => clearTimeout(delayDebounceFn)
  }, [searchQuery])

  const handleInputChange = (e) => {
    const val = e.target.value
    setNewMessage(val)

    if (!currentChat) return

    if (val.trim()) {
      if (!isTypingRef.current) {
        isTypingRef.current = true
        updateDoc(doc(db, 'chats', currentChat.id), {
          [`typing.${user.uid}`]: true
        }).catch(err => console.error(err))
      }

      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
      typingTimeoutRef.current = setTimeout(() => {
        isTypingRef.current = false
        updateDoc(doc(db, 'chats', currentChat.id), {
          [`typing.${user.uid}`]: false
        }).catch(err => console.error(err))
      }, 2500)
    } else {
      if (isTypingRef.current) {
        isTypingRef.current = false
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
        updateDoc(doc(db, 'chats', currentChat.id), {
          [`typing.${user.uid}`]: false
        }).catch(err => console.error(err))
      }
    }
  }

  // Attachment helpers
  const formatFileSize = (bytes) => {
    if (!bytes && bytes !== 0) return ''
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  // Group Permissions helpers
  const isCurrentGroup = Boolean(currentChat?.type === 'group' || currentChat?.isGroup)
  const isCurrentGroupAdmin = Boolean(
    isCurrentGroup && (
      currentChat?.adminUids?.includes(user?.uid) || currentChat?.createdBy === user?.uid
    )
  )
  const canSendInGroup = !isCurrentGroup || (
    (currentChat?.permissions?.whoCanMessage || 'all') !== 'admins' || isCurrentGroupAdmin
  )
  const canStartCallInGroup = !isCurrentGroup || (
    (currentChat?.permissions?.whoCanCall || 'all') !== 'admins' || isCurrentGroupAdmin
  )

  const handleSelectAttachment = async (e, isImageOnly = false) => {
    if (!canSendInGroup) {
      showToast('Only group admins can send messages and files in this group.', 'warning')
      if (e?.target) e.target.value = ''
      return
    }
    const file = e.target.files?.[0]
    if (!file) return

    const isImage = file.type.startsWith('image/') || isImageOnly

    if (isImage) {
      try {
        // Pre-compress immediately on selection for lightning-fast instant send (< 50ms)
        const compressedDataUrl = await compressImageToBase64(file)
        setStagedAttachment({
          file,
          previewUrl: compressedDataUrl,
          dataUrl: compressedDataUrl,
          type: 'image/jpeg',
          name: file.name,
          size: Math.round(compressedDataUrl.length * 0.75),
          isImage: true
        })
      } catch (err) {
        console.error('Error pre-compressing image:', err)
        const preview = URL.createObjectURL(file)
        setStagedAttachment({
          file,
          previewUrl: preview,
          dataUrl: null,
          type: file.type || 'image/jpeg',
          name: file.name,
          size: file.size,
          isImage: true
        })
      }
    } else {
      if (file.size > 650 * 1024) {
        showToast('File size exceeds 650 KB limit for direct instant sharing. Please choose a smaller file.', 'warning')
        e.target.value = ''
        return
      }
      try {
        const fileDataUrl = await readFileToBase64(file)
        setStagedAttachment({
          file,
          previewUrl: null,
          dataUrl: fileDataUrl,
          type: file.type || 'application/octet-stream',
          name: file.name,
          size: file.size,
          isImage: false
        })
      } catch (err) {
        console.error('Error reading file:', err)
      }
    }

    e.target.value = ''
    setTimeout(() => {
      chatInputRef.current?.focus()
    }, 50)
  }

  const handleCancelAttachment = () => {
    if (stagedAttachment?.previewUrl && !stagedAttachment.previewUrl.startsWith('data:')) {
      URL.revokeObjectURL(stagedAttachment.previewUrl)
    }
    setStagedAttachment(null)
  }

  // Compress image to base64 immediately (< 50ms)
  const compressImageToBase64 = (file) => {
    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        const rawDataUrl = e.target.result
        const img = new Image()
        img.onload = () => {
          try {
            const canvas = document.createElement('canvas')
            const MAX_WIDTH = 960
            const MAX_HEIGHT = 960
            let width = img.width
            let height = img.height

            if (width > height) {
              if (width > MAX_WIDTH) {
                height = Math.round((height * MAX_WIDTH) / width)
                width = MAX_WIDTH
              }
            } else {
              if (height > MAX_HEIGHT) {
                width = Math.round((width * MAX_HEIGHT) / height)
                height = MAX_HEIGHT
              }
            }

            canvas.width = width
            canvas.height = height
            const ctx = canvas.getContext('2d')
            ctx.drawImage(img, 0, 0, width, height)
            // 0.65 quality gives clear HD view with tiny ~40KB - 80KB size
            const compressed = canvas.toDataURL('image/jpeg', 0.65)
            resolve(compressed)
          } catch (canvasErr) {
            console.warn('Canvas resize failed, using direct dataUrl:', canvasErr)
            resolve(rawDataUrl)
          }
        }
        img.onerror = () => {
          console.warn('Image render error on canvas, using direct dataUrl')
          resolve(rawDataUrl)
        }
        img.src = rawDataUrl
      }
      reader.onerror = () => {
        console.error('FileReader failed to read image')
        resolve('')
      }
      reader.readAsDataURL(file)
    })
  }

  // Read small file to base64 data URI
  const readFileToBase64 = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  // Instant attachment helper (returns pre-computed dataUrl in 0ms)
  const uploadAttachment = async (attachment, chatId) => {
    if (attachment.dataUrl) {
      return attachment.dataUrl
    }
    if (attachment.isImage) {
      return await compressImageToBase64(attachment.file)
    }
    return await readFileToBase64(attachment.file)
  }

  const handleSend = async (e) => {
    if (e && e.preventDefault) e.preventDefault()
    if (!canSendInGroup) {
      showToast('Only group admins can send messages in this group.', 'warning')
      return
    }
    if ((!newMessage.trim() && !stagedAttachment) || !currentChat || isUploading) return

    const messageText = newMessage.trim()
    const attachmentToSend = stagedAttachment

    setNewMessage('')
    setStagedAttachment(null)

    if (isTypingRef.current) {
      isTypingRef.current = false
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
    }

    const isGroup = currentChat.type === 'group'
    const otherUid = isGroup ? null : currentChat.participants.find(p => p !== user.uid)
    const otherUser = isGroup ? null : usersMap[otherUid]
    const isOtherOnline = otherUser ? isUserOnline(otherUser) : false
    const initialStatus = isOtherOnline ? 'delivered' : 'sent'

    try {
      let fileUrl = null
      let fileName = null
      let fileType = null
      let fileSize = null

      if (attachmentToSend) {
        setIsUploading(true)
        fileUrl = await uploadAttachment(attachmentToSend, currentChat.id)
        fileName = attachmentToSend.name
        fileType = attachmentToSend.type
        fileSize = attachmentToSend.size
      }

      let lastMsgPreview = messageText
      if (!lastMsgPreview && attachmentToSend) {
        lastMsgPreview = attachmentToSend.isImage ? '📷 Photo' : `📎 ${attachmentToSend.name}`
      }

      // E2EE Encryption
      let finalMsgText = messageText
      let textIv = null
      let finalFileUrl = fileUrl
      let fileUrlIv = null
      let isEncrypted = false

      if (isGroup && currentChat.e2eeKeyJwk) {
        try {
          const groupKey = await importGroupKey(currentChat.e2eeKeyJwk)
          if (messageText) {
            const enc = await encryptData(messageText, groupKey)
            finalMsgText = enc.ciphertext
            textIv = enc.iv
            isEncrypted = true
          }
          if (fileUrl) {
            const encFile = await encryptData(fileUrl, groupKey)
            finalFileUrl = encFile.ciphertext
            fileUrlIv = encFile.iv
            isEncrypted = true
          }
        } catch (encErr) {
          console.warn('Group encryption fallback:', encErr)
        }
      } else if (!isGroup && otherUser?.publicKey && myPrivateKey) {
        try {
          const sharedKey = await getSharedKey(myPrivateKey, otherUser.publicKey, otherUid)
          if (sharedKey) {
            if (messageText) {
              const enc = await encryptData(messageText, sharedKey)
              finalMsgText = enc.ciphertext
              textIv = enc.iv
              isEncrypted = true
            }
            if (fileUrl) {
              const encFile = await encryptData(fileUrl, sharedKey)
              finalFileUrl = encFile.ciphertext
              fileUrlIv = encFile.iv
              isEncrypted = true
            }
          }
        } catch (encErr) {
          console.warn('1-on-1 encryption fallback:', encErr)
        }
      }

      // 1. Save the actual message
      const newMsgDoc = await addDoc(collection(db, 'messages'), {
        text: finalMsgText,
        iv: textIv || null,
        isEncrypted,
        chatId: currentChat.id,
        uid: user.uid,
        email: user.email,
        to: otherUid || null,
        status: initialStatus,
        deliveredAt: isOtherOnline ? serverTimestamp() : null,
        readAt: null,
        createdAt: serverTimestamp(),
        fileUrl: finalFileUrl || null,
        fileUrlIv: fileUrlIv || null,
        fileName: fileName || null,
        fileType: fileType || null,
        fileSize: fileSize || null,
        isImage: attachmentToSend ? attachmentToSend.isImage : false
      })

      // Immediate local decrypted cache for fast rendering
      if (isEncrypted) {
        setDecryptedMap(prev => ({
          ...prev,
          [newMsgDoc.id]: { text: messageText, fileUrl }
        }))
      }

      // 2. Prepare unread count updates
      const unreadUpdates = {}
      if (isGroup) {
        currentChat.participants.forEach(pId => {
          if (pId !== user.uid) {
            unreadUpdates[`unreadCount.${pId}`] = increment(1)
          }
        })
      } else if (otherUid) {
        unreadUpdates[`unreadCount.${otherUid}`] = increment(1)
      }

      // 3. Update chat document
      const chatUpdates = {
        lastMessage: lastMsgPreview,
        lastMessageSender: user.uid,
        lastMessageTime: serverTimestamp(),
        lastMessageStatus: initialStatus,
        ...unreadUpdates,
        [`typing.${user.uid}`]: false
      }
      if (!isGroup && otherUid) {
        chatUpdates[`userLastMessage.${user.uid}`] = deleteField()
        chatUpdates[`userLastMessage.${otherUid}`] = deleteField()
      }

      await updateDoc(doc(db, 'chats', currentChat.id), chatUpdates)
    } catch (err) {
      console.error('Error sending message/attachment:', err)
      showToast(err.message || 'Failed to send file.', 'error')
    } finally {
      setIsUploading(false)
    }
  }

  // Voice Note Send Handler
  const handleSendVoiceNote = async (audioDataUrl, duration) => {
    if (!canSendInGroup) {
      showToast('Only group admins can send voice notes in this group.', 'warning')
      return
    }
    if (!currentChat || isUploading) return
    setIsRecordingVoice(false)

    const isGroup = currentChat.type === 'group'
    const otherUid = isGroup ? null : currentChat.participants.find(p => p !== user.uid)
    const otherUser = isGroup ? null : usersMap[otherUid]
    const isOtherOnline = otherUser ? isUserOnline(otherUser) : false
    const initialStatus = isOtherOnline ? 'delivered' : 'sent'

    try {
      setIsUploading(true)
      let finalAudioUrl = audioDataUrl
      let audioIv = null
      let isEncrypted = false

      if (isGroup && currentChat.e2eeKeyJwk) {
        try {
          const groupKey = await importGroupKey(currentChat.e2eeKeyJwk)
          const enc = await encryptData(audioDataUrl, groupKey)
          finalAudioUrl = enc.ciphertext
          audioIv = enc.iv
          isEncrypted = true
        } catch (e) {
          console.warn('Group audio encryption error:', e)
        }
      } else if (!isGroup && otherUser?.publicKey && myPrivateKey) {
        try {
          const sharedKey = await getSharedKey(myPrivateKey, otherUser.publicKey, otherUid)
          if (sharedKey) {
            const enc = await encryptData(audioDataUrl, sharedKey)
            finalAudioUrl = enc.ciphertext
            audioIv = enc.iv
            isEncrypted = true
          }
        } catch (e) {
          console.warn('1-on-1 audio encryption error:', e)
        }
      }

      const newMsgDoc = await addDoc(collection(db, 'messages'), {
        text: '🎤 Voice message',
        chatId: currentChat.id,
        uid: user.uid,
        email: user.email,
        to: otherUid || null,
        status: initialStatus,
        deliveredAt: isOtherOnline ? serverTimestamp() : null,
        readAt: null,
        createdAt: serverTimestamp(),
        fileUrl: finalAudioUrl,
        fileUrlIv: audioIv || null,
        isEncrypted,
        isAudio: true,
        duration: duration || 1,
        fileName: 'voice-note.webm',
        fileType: 'audio/webm'
      })

      if (isEncrypted) {
        setDecryptedMap(prev => ({
          ...prev,
          [newMsgDoc.id]: { text: '🎤 Voice message', fileUrl: audioDataUrl }
        }))
      }

      const unreadUpdates = {}
      if (isGroup) {
        currentChat.participants.forEach(pId => {
          if (pId !== user.uid) unreadUpdates[`unreadCount.${pId}`] = increment(1)
        })
      } else if (otherUid) {
        unreadUpdates[`unreadCount.${otherUid}`] = increment(1)
      }

      await updateDoc(doc(db, 'chats', currentChat.id), {
        lastMessage: '🎤 Voice message',
        lastMessageSender: user.uid,
        lastMessageTime: serverTimestamp(),
        lastMessageStatus: initialStatus,
        ...unreadUpdates,
        [`typing.${user.uid}`]: false
      })
    } catch (err) {
      console.error('Error sending voice note:', err)
      showToast('Failed to send voice note.', 'error')
    } finally {
      setIsUploading(false)
    }
  }

  // Group WebRTC Call Handler
  const handleStartOrJoinGroupCall = async (isVideo, specificCallId = null, targetGroupChat = null) => {
    const targetGroup = targetGroupChat || currentChat
    if (!targetGroup) return

    if (activeGroupCallSession) {
      showToast('You are already in a group call.', 'info')
      return
    }

    try {
      // Only join existing call if explicitly requested by specificCallId or if there is an active call with other participants connected
      let callIdToJoin = specificCallId || null
      if (!callIdToJoin && currentActiveGroupCall) {
        const hasConnectedRemote = currentActiveGroupCall.participantUids?.some(uid => uid !== user.uid)
        if (hasConnectedRemote) {
          callIdToJoin = currentActiveGroupCall.id
        }
      }
      const isNewCall = !callIdToJoin
      const isTargetAdmin = targetGroup.adminUids?.includes(user.uid) || targetGroup.createdBy === user.uid

      if (isNewCall && targetGroup.permissions?.whoCanCall === 'admins' && !isTargetAdmin) {
        showToast('Only group admins can start a call in this group.', 'warning')
        return
      }

      const session = await joinGroupCall({
        callId: callIdToJoin,
        groupChat: targetGroup,
        currentUser: user,
        isVideo,
        onLocalStream: (stream) => {
          setActiveGroupCallSession((prev) => (prev ? { ...prev, localStream: stream } : null))
        },
        onRemoteStream: (remoteUid, stream) => {
          setActiveGroupCallSession((prev) => {
            if (!prev) return null
            return {
              ...prev,
              remoteStreams: { ...(prev.remoteStreams || {}), [remoteUid]: stream }
            }
          })
        },
        onRemoteStreamRemoved: (remoteUid) => {
          setActiveGroupCallSession((prev) => {
            if (!prev) return null
            const nextStreams = { ...(prev.remoteStreams || {}) }
            delete nextStreams[remoteUid]
            return { ...prev, remoteStreams: nextStreams }
          })
        },
        onParticipantsUpdate: (participantsList) => {
          setActiveGroupCallSession((prev) => (prev ? { ...prev, participants: participantsList } : null))
        },
        onCallEnd: (reason) => {
          setActiveGroupCallSession(null)
          if (reason === 'declined') {
            showToast('Call was declined', 'call-declined')
          } else if (reason === 'ended' || reason === 'participants_left') {
            showToast('Call ended', 'info')
          }
        }
      })

      setActiveGroupCallSession({
        callId: session.callId,
        groupChat: targetGroup,
        isHost: session.isHost,
        localStream: session.localStream,
        remoteStreams: session.remoteStreams || {},
        participants: [
          {
            uid: user.uid,
            name: user.displayName || user.email?.split('@')[0] || 'User',
            photoURL: user.photoURL || null,
            isMuted: false,
            isCamOff: !isVideo
          }
        ],
        toggleMic: session.toggleMic,
        toggleCam: session.toggleCam,
        toggleScreenShare: session.toggleScreenShare,
        leaveCall: session.leaveCall,
        endCallForEveryone: session.endCallForEveryone
      })

      if (isNewCall) {
        addDoc(collection(db, 'messages'), {
          chatId: targetGroup.id,
          uid: user.uid,
          email: user.email,
          text: `📹 ${user.displayName || user.email?.split('@')[0]} started a group video call`,
          isSystem: true,
          isGroupCall: true,
          callId: session.callId,
          createdAt: serverTimestamp(),
          status: 'read'
        }).catch((err) => console.warn('Could not post call message:', err))

        updateDoc(doc(db, 'chats', targetGroup.id), {
          lastMessage: `📹 Group video call started`,
          lastMessageSender: user.uid,
          lastMessageTime: serverTimestamp()
        }).catch((err) => console.warn('Could not update chat lastMessage:', err))
      }
    } catch (err) {
      showToast(err.message || 'Failed to connect to group video call', 'error')
      setActiveGroupCallSession(null)
    }
  }

  // WebRTC Call Handlers
  const handleStartCall = async (isVideo) => {
    if (!currentChat) return
    if (currentChat.type === 'group' || currentChat.isGroup) {
      handleStartOrJoinGroupCall(isVideo)
      return
    }

    const otherUid = currentChat.otherUid || (currentChat.participants?.find(p => p !== user.uid))
    if (!otherUid) {
      showToast('Cannot find contact for calling.', 'error')
      return
    }

    const otherUser = usersMap[otherUid] || {
      uid: otherUid,
      username: currentChat.otherEmail?.split('@')[0] || 'Friend',
      email: currentChat.otherEmail || '',
      photoURL: currentChat.otherPhoto || null
    }

    try {
      setActiveCallSession({
        callId: null,
        isCaller: true,
        type: isVideo ? 'video' : 'audio',
        otherUser,
        localStream: null,
        remoteStream: null,
        status: 'ringing',
        endCall: () => setActiveCallSession(null),
        toggleMic: () => {},
        toggleCam: () => {}
      })

      const session = await startCall({
        callerUser: user,
        calleeUid: otherUid,
        calleeUser: otherUser,
        chatId: currentChat.id,
        isVideo,
        onLocalStream: (stream) => {
          setActiveCallSession(prev => (prev ? { ...prev, localStream: stream } : null))
        },
        onRemoteStream: (stream) => {
          setActiveCallSession(prev => (prev ? { ...prev, remoteStream: stream, status: 'connected' } : null))
        },
        onCallConnected: () => {
          setActiveCallSession(prev => (prev ? { ...prev, status: 'connected' } : null))
        },
        onCallEnd: (status) => {
          setActiveCallSession(null)
          if (status === 'declined') {
            showToast('Call was declined', 'call-declined')
          } else {
            showToast('Call ended', 'info')
          }
        }
      })

      if (session.isEnded && session.isEnded()) {
        setActiveCallSession(null)
        return
      }

      setActiveCallSession(prev => {
        if (!prev) return null
        return {
          ...prev,
          callId: session.callId,
          isCaller: true,
          type: isVideo ? 'video' : 'audio',
          otherUser,
          localStream: session.localStream || prev.localStream || null,
          remoteStream: prev.remoteStream || session.remoteStream || null,
          status: prev.status === 'connected' ? 'connected' : 'ringing',
          endCall: session.endCall,
          toggleMic: session.toggleMic,
          toggleCam: session.toggleCam
        }
      })
    } catch (err) {
      showToast(err.message || 'Failed to start call', 'error')
      setActiveCallSession(null)
    }
  }

  const handleAcceptCall = async (callData) => {
    setIncomingCall(null)
    if (callData.isGroup) {
      let targetGroup = callData.groupChat || chats.find(c => c.id === callData.chatId) || (currentChat?.id === callData.chatId ? currentChat : null)
      if (!targetGroup) {
        targetGroup = {
          id: callData.chatId,
          type: 'group',
          name: callData.groupName || 'Group',
          photoURL: callData.groupPhoto || null,
          participants: callData.members || []
        }
      }
      setCurrentChat(targetGroup)
      handleStartOrJoinGroupCall(callData.type === 'video', callData.id, targetGroup)
      return
    }
    try {
      const callerUserData = usersMap[callData.callerUid] || {
        username: callData.callerName,
        email: callData.callerEmail,
        photoURL: callData.callerPhoto
      }

      setActiveCallSession({
        callId: callData.id,
        isCaller: false,
        type: callData.type,
        otherUser: callerUserData,
        localStream: null,
        remoteStream: null,
        status: 'connected',
        endCall: () => {
          declineCall(callData.id)
          setActiveCallSession(null)
        },
        toggleMic: () => {},
        toggleCam: () => {}
      })

      const session = await answerCall({
        callId: callData.id,
        isVideo: callData.type === 'video',
        onLocalStream: (stream) => {
          setActiveCallSession(prev => (prev ? { ...prev, localStream: stream } : null))
        },
        onRemoteStream: (stream) => {
          setActiveCallSession(prev => (prev ? { ...prev, remoteStream: stream, status: 'connected' } : null))
        },
        onCallEnd: (status) => {
          setActiveCallSession(null)
        }
      })

      if (session.isEnded && session.isEnded()) {
        setActiveCallSession(null)
        return
      }

      setActiveCallSession(prev => {
        if (!prev) return null
        return {
          ...prev,
          callId: session.callId,
          isCaller: false,
          type: callData.type,
          otherUser: callerUserData,
          localStream: session.localStream || prev.localStream || null,
          remoteStream: prev.remoteStream || session.remoteStream || null,
          status: 'connected',
          endCall: session.endCall,
          toggleMic: session.toggleMic,
          toggleCam: session.toggleCam
        }
      })
    } catch (err) {
      showToast(err.message || 'Failed to answer call', 'error')
      setActiveCallSession(null)
    }
  }

  const handleDeclineCall = async (callId) => {
    if (callId) {
      dismissedCallsRef.current.add(callId)
    }
    if (incomingCall?.isGroup) {
      try {
        const callRef = doc(db, 'groupCalls', callId)
        const callSnap = await getDoc(callRef)
        if (callSnap.exists()) {
          const callData = callSnap.data()
          const currentDeclined = callData.declinedUids || []
          const updatedDeclined = [...new Set([...currentDeclined, user.uid])]
          const members = callData.members || []
          const otherMembers = members.filter((uid) => uid !== callData.hostUid)
          const allDeclined = otherMembers.length > 0 && otherMembers.every((uid) => updatedDeclined.includes(uid))

          await updateDoc(callRef, {
            declinedUids: arrayUnion(user.uid),
            ...(allDeclined ? {
              status: 'ended',
              endedAt: serverTimestamp(),
              endReason: 'declined',
              participantUids: []
            } : {})
          })
        } else {
          await updateDoc(callRef, {
            declinedUids: arrayUnion(user.uid)
          })
        }
      } catch (e) {
        console.warn('Error recording group call decline:', e)
      }
      setIncomingCall(null)
      return
    }
    await declineCall(callId)
    setIncomingCall(null)
  }

  // Delete & Multi-Select Handlers
  const handleExitSelectMode = () => {
    setIsSelectMode(false)
    setSelectedMsgIds(new Set())
  }

  const handleToggleSelectMessage = (msgId) => {
    setSelectedMsgIds(prev => {
      const next = new Set(prev)
      if (next.has(msgId)) {
        next.delete(msgId)
      } else {
        next.add(msgId)
      }
      return next
    })
  }

  const handleSelectAllMessages = () => {
    setSelectedMsgIds(new Set(messages.map(m => m.id)))
  }

  const handleDeselectAllMessages = () => {
    setSelectedMsgIds(new Set())
  }

  const confirmDeleteSingle = (msg) => {
    if (!msg || !currentChat) return
    setDeleteModal({ type: 'single', msg })
  }

  const executeDeleteSingle = async (msg) => {
    if (!msg || !currentChat || isDeleting) return
    setIsDeleting(true)
    try {
      // Delete for ME only: mark deletedBy on message document so friend keeps it
      await updateDoc(doc(db, 'messages', msg.id), {
        [`deletedBy.${user.uid}`]: true
      })

      const remaining = messages.filter(m => m.id !== msg.id)
      setMessages(remaining)

      if (remaining.length > 0) {
        const latest = remaining[remaining.length - 1]
        let preview = latest.text || ''
        if (!preview && latest.fileUrl) {
          preview = (latest.isImage || latest.fileType?.startsWith('image/')) ? '📷 Photo' : `📎 ${latest.fileName || 'File'}`
        }
        await updateDoc(doc(db, 'chats', currentChat.id), {
          [`userLastMessage.${user.uid}`]: {
            text: preview,
            sender: latest.uid || '',
            time: latest.createdAt || null,
            status: latest.status || null
          }
        })
      } else {
        await updateDoc(doc(db, 'chats', currentChat.id), {
          [`userLastMessage.${user.uid}`]: {
            text: '',
            sender: '',
            time: null,
            status: null
          }
        })
      }

      if (messageReadInfo?.id === msg.id) {
        setMessageReadInfo(null)
      }
      setDeleteModal(null)
    } catch (err) {
      console.error('Error deleting message:', err)
    } finally {
      setIsDeleting(false)
    }
  }

  const confirmDeleteSelected = () => {
    if (selectedMsgIds.size === 0 || !currentChat) return
    setDeleteModal({ type: 'multiple', count: selectedMsgIds.size })
  }

  const executeDeleteSelected = async () => {
    if (selectedMsgIds.size === 0 || !currentChat || isDeleting) return
    setIsDeleting(true)
    try {
      const batch = writeBatch(db)
      selectedMsgIds.forEach(id => {
        batch.update(doc(db, 'messages', id), {
          [`deletedBy.${user.uid}`]: true
        })
      })
      await batch.commit()

      const remaining = messages.filter(m => !selectedMsgIds.has(m.id))
      setMessages(remaining)

      if (remaining.length > 0) {
        const latest = remaining[remaining.length - 1]
        let preview = latest.text || ''
        if (!preview && latest.fileUrl) {
          preview = (latest.isImage || latest.fileType?.startsWith('image/')) ? '📷 Photo' : `📎 ${latest.fileName || 'File'}`
        }
        await updateDoc(doc(db, 'chats', currentChat.id), {
          [`userLastMessage.${user.uid}`]: {
            text: preview,
            sender: latest.uid || '',
            time: latest.createdAt || null,
            status: latest.status || null
          }
        })
      } else {
        await updateDoc(doc(db, 'chats', currentChat.id), {
          [`userLastMessage.${user.uid}`]: {
            text: '',
            sender: '',
            time: null,
            status: null
          }
        })
      }

      setDeleteModal(null)
      handleExitSelectMode()
    } catch (err) {
      console.error('Error deleting selected messages:', err)
    } finally {
      setIsDeleting(false)
    }
  }

  const confirmClearAllChat = () => {
    if (!currentChat) return
    setDeleteModal({ type: 'all' })
  }

  const executeClearAllChat = async () => {
    if (!currentChat || isDeleting) return
    setIsDeleting(true)
    try {
      // Clear for ME only: mark clearedAt on chat document so friend keeps their entire history
      await updateDoc(doc(db, 'chats', currentChat.id), {
        [`clearedAt.${user.uid}`]: serverTimestamp(),
        [`unreadCount.${user.uid}`]: 0,
        [`userLastMessage.${user.uid}`]: {
          text: '',
          sender: '',
          time: null,
          status: null
        }
      })

      setDeleteModal(null)
      handleExitSelectMode()
      setMessages([])
    } catch (err) {
      console.error('Error clearing chat:', err)
    } finally {
      setIsDeleting(false)
    }
  }

  const executeUnfriend = async (targetUser) => {
    if (!targetUser || isDeleting) return
    setIsDeleting(true)
    try {
      const existingChat = chats.find(c => c.otherUid === targetUser.uid)
      if (existingChat) {
        if (currentChat?.id === existingChat.id) {
          setCurrentChat(null)
        }
        // 1. Delete all messages from this chat
        const qMsg = query(collection(db, 'messages'), where('chatId', '==', existingChat.id))
        const msgSnap = await getDocs(qMsg)
        const batch = writeBatch(db)
        msgSnap.forEach(d => batch.delete(d.ref))
        await batch.commit()

        // 2. Delete the chat document
        await deleteDoc(doc(db, 'chats', existingChat.id))
      }

      // 3. Remove any pending/accepted requests between these users
      const qReq1 = query(
        collection(db, 'requests'),
        where('from', '==', user.uid),
        where('to', '==', targetUser.uid)
      )
      const qReq2 = query(
        collection(db, 'requests'),
        where('from', '==', targetUser.uid),
        where('to', '==', user.uid)
      )
      const [snap1, snap2] = await Promise.all([getDocs(qReq1), getDocs(qReq2)])
      const reqBatch = writeBatch(db)
      snap1.forEach(d => reqBatch.delete(d.ref))
      snap2.forEach(d => reqBatch.delete(d.ref))
      await reqBatch.commit()

      // 4. Update sentRequests state if needed
      setSentRequests(prev => {
        const next = new Set(prev)
        next.delete(targetUser.uid)
        return next
      })

      setDeleteModal(null)
      setInAppToast({
        senderName: 'Friends',
        text: `Unfriended ${usersMap[targetUser.uid]?.username || targetUser.email?.split('@')[0] || 'user'}`,
        isSystem: true
      })
      setTimeout(() => setInAppToast(null), 3000)
    } catch (err) {
      console.error('Error unfriending user:', err)
    } finally {
      setIsDeleting(false)
    }
  }

  const handleSendRequest = async (targetUser) => {
    // Prevent sending request to self
    if (targetUser.uid === user.uid) return;

    try {
      await addDoc(collection(db, 'requests'), {
        from: user.uid,
        fromEmail: user.email,
        to: targetUser.uid,
        toEmail: targetUser.email,
        status: 'pending',
        createdAt: serverTimestamp()
      })
      setSentRequests(prev => new Set(prev).add(targetUser.uid))
    } catch (err) {
      console.error('Error sending request:', err)
    }
  }

  const handleAcceptRequest = async (request) => {
    try {
      // 1. Mark request as accepted
      await updateDoc(doc(db, 'requests', request.id), { status: 'accepted' })

      // 2. Create the chat room (initialize unread counts to 0)
      await addDoc(collection(db, 'chats'), {
        participants: [user.uid, request.from],
        participantEmails: [user.email, request.fromEmail],
        createdAt: serverTimestamp(),
        unreadCount: {
          [user.uid]: 0,
          [request.from]: 0
        }
      })
    } catch (err) {
      console.error('Error accepting request:', err)
    }
  }

  const handleDeclineRequest = async (request) => {
    try {
      await deleteDoc(doc(db, 'requests', request.id))
    } catch (err) {
      console.error('Error declining request:', err)
    }
  }

  const handleSignOut = () => {
    auth.signOut()
  }

  const handleSelectChat = async (chat) => {
    handleExitSelectMode()
    setDeleteModal(null)
    setShowChatMenu(false)

    // If clicking the already open chat, close it!
    if (currentChat?.id === chat.id) {
      setCurrentChat(null)
      return
    }

    setCurrentChat(chat)

    // Add a state to the browser history so the physical back button works on Android/iOS
    window.history.pushState({ chatOpen: true }, '')

    // Instantly clear the unread count when clicking on a chat
    try {
      const updates = {
        [`unreadCount.${user.uid}`]: 0
      }
      if (chat.lastMessageSender && chat.lastMessageSender !== user.uid) {
        updates.lastMessageStatus = 'read'
      }
      await updateDoc(doc(db, 'chats', chat.id), updates)
    } catch (err) {
      console.error('Error resetting unread count:', err)
    }
  }

  // Handle hardware back button (Android/iOS swipe)
  useEffect(() => {
    // 1. Web fallback popstate
    const handlePopState = () => {
      if (isSelectMode) {
        handleExitSelectMode()
        return
      }
      if (currentChat) {
        setCurrentChat(null)
      }
    }
    window.addEventListener('popstate', handlePopState)

    // 2. Capacitor Native Back Button handling
    let backButtonListener = null
    const setupNativeBack = async () => {
      try {
        backButtonListener = await App.addListener('backButton', ({ canGoBack }) => {
          if (isSelectMode) {
            handleExitSelectMode()
          } else if (currentChat) {
            setCurrentChat(null)
          } else if (canGoBack) {
            window.history.back()
          } else {
            App.exitApp()
          }
        })
      } catch (e) {
        // Ignored if not running in capacitor native environment
      }
    }
    setupNativeBack()

    return () => {
      window.removeEventListener('popstate', handlePopState)
      if (backButtonListener && backButtonListener.remove) {
        backButtonListener.remove()
      }
    }
  }, [currentChat, isSelectMode])

  // Profile Image Compression & Upload
  const handlePhotoUpload = (e) => {
    const file = e.target.files[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (event) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        const MAX_WIDTH = 200
        const MAX_HEIGHT = 200
        let width = img.width
        let height = img.height

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width
            width = MAX_WIDTH
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height
            height = MAX_HEIGHT
          }
        }
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0, width, height)
        // Compress to JPEG with 0.7 quality to easily fit in Firestore
        const dataUrl = canvas.toDataURL('image/jpeg', 0.7)
        setProfilePhoto(dataUrl)
      }
      img.src = event.target.result
    }
    reader.readAsDataURL(file)
  }

  const openThemeModal = (target) => {
    setThemeModalTarget(target)
    setGlobalApplyScope('all')
    const dbSettings = usersMap[user?.uid]?.themeSettings || {}
    const globalSettings = { ...(dbSettings.global || {}), ...(localThemeSettings?.global || {}) }
    const perChatSettings = (localThemeSettings && localThemeSettings.perChat !== undefined)
      ? localThemeSettings.perChat
      : (dbSettings.perChat || {})

    let settings = {}
    if (target === 'chat' && currentChat) {
      settings = perChatSettings[currentChat.id] || (Object.keys(globalSettings).length > 0 ? globalSettings : dbSettings)
    } else {
      settings = Object.keys(globalSettings).length > 0 ? globalSettings : dbSettings
    }

    setModalThemeColor(settings.themeColor || 'light')
    setModalBgImage(settings.bgImage || '')
    setModalBgSize(settings.bgSize || 'cover')
    const pos = settings.bgPosition || 'center'
    setModalBgPosition(pos)
    const parsed = parseBgPosition(pos)
    setModalBgPosX(parsed.x)
    setModalBgPosY(parsed.y)
  }

  const handleThemePhotoUpload = (e) => {
    const file = e.target.files[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (event) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        const MAX_WIDTH = 1920
        const MAX_HEIGHT = 1920
        let width = img.width
        let height = img.height

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width
            width = MAX_WIDTH
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height
            height = MAX_HEIGHT
          }
        }
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0, width, height)
        const dataUrl = canvas.toDataURL('image/jpeg', 0.7)
        setModalBgImage(dataUrl)
        if (height > width) {
          updatePosition(50, 15)
        } else {
          updatePosition(50, 50)
        }
      }
      img.src = event.target.result
    }
    reader.readAsDataURL(file)
  }

  const handleSaveTheme = async () => {
    try {
      const newSettings = {
        themeColor: modalThemeColor,
        bgImage: modalBgImage,
        bgSize: modalBgSize,
        bgPosition: `${modalBgPosX}% ${modalBgPosY}%`
      }

      const currentUserData = usersMap[user.uid] || {}
      const currentThemeSettings = currentUserData.themeSettings || {}

      let updatedThemeSettings = {
        ...currentThemeSettings,
        ...localThemeSettings
      }

      if (themeModalTarget === 'global') {
        // Global Theme applies from outside
        updatedThemeSettings.global = newSettings
        updatedThemeSettings.themeColor = newSettings.themeColor
        updatedThemeSettings.bgImage = newSettings.bgImage
        updatedThemeSettings.bgSize = newSettings.bgSize
        updatedThemeSettings.bgPosition = newSettings.bgPosition

        if (globalApplyScope === 'all') {
          // Reset all custom chat themes so ALL screens/chats take the new global theme
          updatedThemeSettings.perChat = {}
        } else {
          // Keep existing custom chat themes intact; only chats without custom themes inherit this global theme
          const existingPerChat = (localThemeSettings && localThemeSettings.perChat !== undefined)
            ? localThemeSettings.perChat
            : (currentThemeSettings.perChat || {})
          updatedThemeSettings.perChat = { ...existingPerChat }
        }
      } else if (themeModalTarget === 'chat' && currentChat) {
        // Inside chat 3-dot menu applies only to this chat
        const currentPerChat = (localThemeSettings && localThemeSettings.perChat !== undefined)
          ? { ...localThemeSettings.perChat }
          : { ...(currentThemeSettings.perChat || {}) }
        currentPerChat[currentChat.id] = newSettings
        updatedThemeSettings.perChat = currentPerChat
      }

      // 1. Immediately apply locally
      setLocalThemeSettings(updatedThemeSettings)
      localStorage.setItem(`chatflow_theme_${user.uid}`, JSON.stringify(updatedThemeSettings))

      // 2. Persist to Firestore in background
      const userRef = doc(db, 'users', user.uid)
      await updateDoc(userRef, {
        themeSettings: updatedThemeSettings
      })

      setThemeModalTarget(null)
      setInAppToast({
        senderName: 'Theme & Wallpaper',
        text: themeModalTarget === 'global'
          ? (globalApplyScope === 'all' ? 'Applied to all screens! 🌐' : 'Applied to remaining screens! 💬')
          : 'Theme settings updated! 🎨',
        isSystem: true
      })
      setTimeout(() => setInAppToast(null), 3000)
    } catch (err) {
      console.error('Error saving theme:', err)
      setThemeModalTarget(null)
    }
  }

  const handleSaveProfile = async () => {
    setUsernameError('')
    const trimmedUsername = profileUsername.trim()

    try {
      if (trimmedUsername) {
        // Check uniqueness
        const usersRef = collection(db, 'users')
        const q = query(usersRef, where('username', '==', trimmedUsername))
        const querySnapshot = await getDocs(q)

        let isTaken = false
        querySnapshot.forEach((docSnap) => {
          if (docSnap.id !== user.uid) {
            isTaken = true
          }
        })

        if (isTaken) {
          setUsernameError('This username is already taken!')
          return
        }
      }

      await updateDoc(doc(db, 'users', user.uid), {
        bio: profileBio,
        photoURL: profilePhoto,
        username: trimmedUsername || ''
      })
      setShowProfileModal(false)
    } catch (err) {
      console.error('Error saving profile:', err)
      setUsernameError('Failed to save profile.')
    }
  }

  const activeChatDoc = chats.find(c => c.id === currentChat?.id)
  const isOtherTyping = Boolean(currentChat && activeChatDoc?.typing?.[currentChat.otherUid])

  const currentActiveGroupCall = (currentChat?.type === 'group' || currentChat?.isGroup)
    ? (activeGroupCallForChat || (currentChat?.id ? activeGroupCalls[currentChat.id] : null))
    : null

  useEffect(() => {
    if (isOtherTyping && messageStreamRef.current) {
      messageStreamRef.current.scrollTop = messageStreamRef.current.scrollHeight
    }
  }, [isOtherTyping])

  return (
    <div className={`layout-container ${currentChat ? 'chat-active' : ''}`} data-theme={activeDocumentTheme}>
      {/* Floating In-App Webpage Toast Notification (In-DOM top notification) */}
      {toast && (
        <div className={`app-web-toast toast-${toast.type}`} role="status" aria-live="polite">
          <div className="toast-icon-wrap">
            {toast.type === 'call-declined' ? (
              <PhoneOff size={18} />
            ) : toast.type === 'error' ? (
              <AlertCircle size={18} />
            ) : toast.type === 'warning' ? (
              <AlertTriangle size={18} />
            ) : toast.type === 'success' ? (
              <CheckCircle2 size={18} />
            ) : (
              <Info size={18} />
            )}
          </div>
          <span className="toast-text">{toast.message}</span>
          <button
            type="button"
            className="toast-dismiss-btn"
            onClick={() => setToast(null)}
            title="Dismiss notification"
          >
            <X size={15} />
          </button>
        </div>
      )}

      {/* Floating In-App Message Toast Notification */}
      {inAppToast && (
        <div 
          className="notification-toast"
          onClick={() => {
            handleSelectChat(inAppToast.chat)
            setInAppToast(null)
          }}
        >
          {inAppToast.senderPhoto ? (
            <img src={inAppToast.senderPhoto} alt={inAppToast.senderName} className="toast-avatar" />
          ) : (
            <div className="toast-avatar-fallback">
              <User size={20} />
            </div>
          )}
          <div className="toast-content">
            <div className="toast-title">
              <span>{inAppToast.senderName}</span>
              <span style={{ fontSize: '0.7rem', color: 'var(--color-primary)', fontWeight: '600' }}>• New</span>
            </div>
            <div className="toast-body">{inAppToast.text}</div>
          </div>
          <button 
            className="toast-close-btn"
            onClick={(e) => {
              e.stopPropagation()
              setInAppToast(null)
            }}
            title="Dismiss"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Sidebar */}
      <aside className="sidebar" data-theme={activeDocumentTheme}>
        <div className="sidebar-header">
          <h2 className="server-name">ChatFlow</h2>
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            <button
              onClick={toggleGlobalNotifications}
              title={
                globalNotifications
                  ? 'Notifications are ON (click to mute all)'
                  : 'Notifications are MUTED (click to turn on)'
              }
              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center' }}
            >
              {globalNotifications ? (
                <Bell size={18} className="action-icon" style={{ color: 'var(--color-primary)' }} />
              ) : (
                <BellOff size={18} className="action-icon" style={{ color: 'var(--color-red)' }} />
              )}
            </button>
            <button
              onClick={() => openThemeModal('global')}
              title="Global Theme & Wallpaper"
              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center' }}
            >
              <Palette size={18} className="action-icon" />
            </button>
            <Settings size={18} className="action-icon" />
          </div>
        </div>

        {/* Notification Permission Request Banner */}
        {notifPermission === 'default' && !dismissNotifBanner && (
          <div className="notif-banner">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', minWidth: 0 }}>
              <Bell size={15} style={{ color: 'var(--color-primary)', flexShrink: 0 }} />
              <span style={{ fontSize: '0.75rem', color: 'var(--color-text-main)', lineHeight: 1.2 }}>Enable message notifications</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexShrink: 0 }}>
              <button className="notif-banner-btn" onClick={requestNotifPermission}>
                Enable
              </button>
              <button 
                className="toast-close-btn" 
                onClick={() => setDismissNotifBanner(true)}
                title="Dismiss"
              >
                <X size={14} />
              </button>
            </div>
          </div>
        )}

        <div className="sidebar-search">
          <div className="search-input-wrapper">
            <Search size={16} />
            <input
              type="text"
              placeholder="Search by username..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {searchQuery && (
          <div className="search-results-container">
            <div className="search-results-header">Search Results</div>
            {isSearching ? (
              <div className="search-loading">Searching...</div>
            ) : searchResults.length > 0 ? (
              <ul className="search-results-list">
                {searchResults.map(result => {
                  const isSelf = result.uid === user.uid;
                  const isFriend = chats.some(c => c.otherUid === result.uid);
                  const resultPhoto = usersMap[result.uid]?.photoURL;
                  const displayUsername = result.username || result.email?.split('@')[0] || 'user';
                  return (
                    <li key={result.uid} className="search-result-item">
                      <div 
                        className="search-result-info" 
                        style={{ cursor: isFriend ? 'pointer' : 'default', flex: 1 }}
                        onClick={() => {
                          if (isFriend && !isSelf) {
                            const existingChat = chats.find(c => c.otherUid === result.uid);
                            if (existingChat) {
                              setSearchQuery('');
                              handleSelectChat(existingChat);
                            }
                          }
                        }}
                      >
                        <div className="search-result-avatar" style={{ position: 'relative' }}>
                          {resultPhoto ? (
                            <img src={resultPhoto} alt="Avatar" className="avatar-img" />
                          ) : (
                            <User size={14} />
                          )}
                          <div 
                            className={`status-indicator ${isUserOnline(usersMap[result.uid]) ? 'online' : ''}`}
                            style={{ width: 8, height: 8, bottom: -1, right: -1 }}
                            title={isUserOnline(usersMap[result.uid]) ? 'Online' : 'Offline'}
                          ></div>
                        </div>
                        <span className="search-result-email">@{displayUsername} {isSelf && "(You)"}</span>
                        {isUserOnline(usersMap[result.uid]) && !isSelf && (
                          <span style={{ fontSize: '0.72rem', color: 'var(--color-green)', fontWeight: '600', marginLeft: '0.5rem' }}>• Online</span>
                        )}
                      </div>
                      {!isSelf && (
                        isFriend ? (
                          <button 
                            className="req-btn unfriend" 
                            onClick={() => setDeleteModal({ type: 'unfriend', user: result })}
                            title="Unfriend user"
                          >
                            <UserMinus size={14} /> Unfriend
                          </button>
                        ) : sentRequests.has(result.uid) ? (
                          <button className="req-btn sent" disabled>
                            <Check size={14} /> Sent
                          </button>
                        ) : (
                          <button className="req-btn" onClick={() => handleSendRequest(result)}>
                            <UserPlus size={14} /> Add
                          </button>
                        )
                      )}
                    </li>
                  )
                })}
              </ul>
            ) : (
              <div className="search-empty">No users found</div>
            )}
          </div>
        )}

        {!searchQuery && (
          <div className="channel-section">

            {/* Incoming Requests */}
            {incomingRequests.length > 0 && (
              <div className="requests-section">
                <div className="channel-section-header">
                  <span>Pending Requests ({incomingRequests.length})</span>
                </div>
                <ul className="requests-list">
                  {incomingRequests.map(req => {
                    const reqPhoto = usersMap[req.from]?.photoURL;
                    return (
                      <li key={req.id} className="request-item">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', overflow: 'hidden' }}>
                          <div className="search-result-avatar">
                            {usersMap[req.from]?.photoURL ? <img src={usersMap[req.from].photoURL} alt="Avatar" className="avatar-img" /> : <User size={14} />}
                          </div>
                          <span className="request-email search-result-email" title={`@${usersMap[req.from]?.username || req.fromEmail?.split('@')[0] || 'user'}`}>
                            @{usersMap[req.from]?.username || req.fromEmail?.split('@')[0] || 'user'}
                          </span>
                        </div>
                        <div className="request-actions">
                          <button className="action-btn accept" onClick={() => handleAcceptRequest(req)} title="Accept">
                            <Check size={14} />
                          </button>
                          <button className="action-btn decline" onClick={() => handleDeclineRequest(req)} title="Decline">
                            <X size={14} />
                          </button>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}

            {/* Direct Messages & Groups */}
            <div className="channel-section-header" style={{ marginTop: incomingRequests.length > 0 ? '1rem' : '0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>Chats & Groups</span>
              <button
                type="button"
                className="btn-new-group-trigger"
                onClick={() => setShowCreateGroupModal(true)}
                title="Create New Group"
                style={{
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--color-primary)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  fontSize: '0.75rem',
                  fontWeight: 600
                }}
              >
                <Users size={14} /> + Group
              </button>
            </div>
            <ul className="channel-list">
              {chats.length === 0 && (
                <div className="search-empty" style={{ padding: '0.5rem' }}>No chats yet. Search someone or create a group!</div>
              )}
              {chats.map(chat => {
                const unreadCount = chat.unreadCount?.[user.uid] || 0;
                const isGroup = chat.type === 'group';
                const friendPhoto = isGroup ? chat.photoURL : usersMap[chat.otherUid]?.photoURL;
                const chatTitle = isGroup ? (chat.name || 'Group') : (usersMap[chat.otherUid]?.username || chat.otherEmail?.split('@')[0] || 'Chat');

                return (
                  <li
                    key={chat.id}
                    className={`channel-item ${currentChat?.id === chat.id ? 'active' : ''}`}
                    onClick={() => handleSelectChat(chat)}
                  >
                    <div className="dm-item-content">
                      <div className="dm-item-top">
                        <div className="avatar dm-avatar">
                          {friendPhoto ? (
                            <img src={friendPhoto} alt="Avatar" className="avatar-img" />
                          ) : isGroup ? (
                            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-primary-light)', color: 'var(--color-primary)', borderRadius: '50%' }}>
                              <Users size={14} />
                            </div>
                          ) : (
                            <User size={14} />
                          )}
                          {!isGroup && (
                            <div 
                              className={`status-indicator ${isUserOnline(usersMap[chat.otherUid]) ? 'online' : ''}`}
                              title={isUserOnline(usersMap[chat.otherUid]) ? 'Online' : 'Offline'}
                            ></div>
                          )}
                        </div>
                        <span className="dm-email" title={chatTitle}>
                          {chatTitle}
                        </span>
                        {activeGroupCalls[chat.id] && (
                          <span className="live-call-badge" style={{ fontSize: '0.62rem', padding: '1px 6px', marginLeft: '0.35rem' }}>
                            <span className="live-dot" /> LIVE
                          </span>
                        )}
                        {isChatMuted(chat.id) && (
                          <BellOff size={13} style={{ color: 'var(--color-text-muted)', marginLeft: '0.35rem', flexShrink: 0 }} title="Notifications muted for this chat" />
                        )}
                        {unreadCount > 0 && (
                          <div className="unread-badge">
                            {unreadCount}
                          </div>
                        )}
                      </div>
                      {chat.typing?.[chat.otherUid] ? (
                        <div className="dm-preview" style={{ color: 'var(--color-green)', fontWeight: '600', fontSize: '0.8rem' }}>
                          typing...
                        </div>
                      ) : (() => {
                        const previewData = getChatPreviewData(chat)
                        if (!previewData || !previewData.text) return null
                        return (
                          <div className={`dm-preview ${previewData.sender !== user.uid && unreadCount > 0 ? 'unread' : ''}`}>
                            {previewData.sender === user.uid && (
                              <span 
                                className="dm-tick-inline" 
                                title={
                                  getChatLastMessageStatus(chat, previewData) === 'read' ? 'Read' :
                                  getChatLastMessageStatus(chat, previewData) === 'delivered' ? 'Delivered' : 'Sent'
                                }
                              >
                                {(() => {
                                  const st = getChatLastMessageStatus(chat, previewData)
                                  if (st === 'read') return <CheckCheck size={14} className="tick-icon tick-read" color="#38bdf8" />
                                  if (st === 'delivered') return <CheckCheck size={14} className="tick-icon tick-delivered" />
                                  return <Check size={14} className="tick-icon tick-sent" />
                                })()}
                              </span>
                            )}
                            <span className="dm-preview-text">{previewData.text}</span>
                          </div>
                        )
                      })()}
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>
        )}

        <div className="sidebar-footer">
          <div
            className="user-info"
            onClick={() => {
              setProfileUsername(usersMap[user.uid]?.username || '')
              setUsernameError('')
              setShowProfileModal(true)
            }}
            style={{ cursor: 'pointer' }}
            title="Edit Profile"
          >
            <div className="avatar">
              {usersMap[user.uid]?.photoURL ? (
                <img src={usersMap[user.uid].photoURL} alt="My Avatar" className="avatar-img" />
              ) : (
                <User size={18} />
              )}
              <div className="status-indicator online"></div>
            </div>
            <div className="user-details">
              <span className="user-name">{usersMap[user.uid]?.username || user.email?.split('@')[0] || 'You'}</span>
              <span className="user-status">Online</span>
            </div>
          </div>
          <button className="sign-out-btn" onClick={handleSignOut} title="Sign Out">
            <LogOut size={18} />
          </button>
        </div>
      </aside>

      {/* Main Chat Area */}
      <main className="main-chat" data-theme={activeChatThemeColor}>
        {currentChat ? (
          <>
            <header className="chat-header">
              {isSelectMode ? (
                <div className="selection-toolbar">
                  <div className="selection-toolbar-left">
                    <button 
                      type="button" 
                      className="action-icon" 
                      onClick={handleExitSelectMode}
                      title="Cancel Selection"
                      style={{ background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                    >
                      <X size={20} />
                    </button>
                    <span className="selection-count-badge">
                      {selectedMsgIds.size} Selected
                    </span>
                    <button 
                      type="button" 
                      className="selection-btn"
                      onClick={selectedMsgIds.size === messages.length && messages.length > 0 ? handleDeselectAllMessages : handleSelectAllMessages}
                    >
                      {selectedMsgIds.size === messages.length && messages.length > 0 ? 'Deselect All' : 'Select All'}
                    </button>
                  </div>

                  <div className="selection-toolbar-right">
                    <button 
                      type="button" 
                      className="selection-btn selection-btn-danger"
                      onClick={confirmDeleteSelected}
                      disabled={selectedMsgIds.size === 0 || isDeleting}
                      title="Delete Selected Messages"
                    >
                      {isDeleting ? (
                        <>
                          <Loader2 size={15} className="animate-spin" />
                          <span>Deleting...</span>
                        </>
                      ) : (
                        <>
                          <Trash2 size={15} />
                          <span>Delete ({selectedMsgIds.size})</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="chat-header-left">
                    <button className="mobile-back-btn" onClick={() => setCurrentChat(null)}>
                      <ChevronLeft size={24} />
                    </button>
                    {currentChat.type === 'group' ? (
                      <div className="chat-header-avatar" onClick={() => setShowGroupInfoModal(true)} style={{ cursor: 'pointer' }}>
                        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-primary-light)', color: 'var(--color-primary)', borderRadius: '50%' }}>
                          <Users size={22} />
                        </div>
                      </div>
                    ) : (
                      <div className="chat-header-avatar" onClick={() => setViewProfileUser(usersMap[currentChat.otherUid])} style={{ cursor: 'pointer' }}>
                        {usersMap[currentChat.otherUid]?.photoURL ? (
                          <img src={usersMap[currentChat.otherUid].photoURL} alt="Avatar" className="avatar-img" />
                        ) : (
                          <User size={24} style={{ color: 'var(--color-outline)' }} />
                        )}
                        <div 
                          className={`status-indicator ${isUserOnline(usersMap[currentChat.otherUid]) ? 'online' : ''}`}
                          title={isUserOnline(usersMap[currentChat.otherUid]) ? 'Online' : 'Offline'}
                        ></div>
                      </div>
                    )}

                    <div onClick={() => (currentChat.type === 'group' || currentChat.isGroup) ? setShowGroupInfoModal(true) : setViewProfileUser(usersMap[currentChat.otherUid])} style={{ cursor: 'pointer' }}>
                      <div style={{ display: 'flex', alignItems: 'center' }}>
                        <h1 className="channel-title">
                          {(currentChat.type === 'group' || currentChat.isGroup) ? (currentChat.name || 'Group') : (usersMap[currentChat.otherUid]?.username || currentChat.otherEmail?.split('@')[0] || 'Chat')}
                        </h1>
                        <span className="e2ee-lock-pill" title="Secured with End-to-End Encryption">
                          <Lock size={11} /> E2EE
                        </span>
                      </div>
                      <p className="channel-topic" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        {(currentChat.type === 'group' || currentChat.isGroup) ? (
                          <span style={{ color: 'var(--color-text-muted)' }}>
                            {currentChat.participants?.length || 0} members • Tap for info
                          </span>
                        ) : isOtherTyping ? (
                          <span style={{ color: 'var(--color-green)', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                            typing
                            <span className="typing-dots-header">
                              <span className="dot">.</span>
                              <span className="dot">.</span>
                              <span className="dot">.</span>
                            </span>
                          </span>
                        ) : isUserOnline(usersMap[currentChat.otherUid]) ? (
                          <>
                            <span className="online-pulse-dot"></span>
                            <span style={{ color: 'var(--color-green)', fontWeight: '600' }}>Online</span>
                          </>
                        ) : (
                          <span style={{ color: 'var(--color-text-muted)' }}>
                            {formatLastSeen(usersMap[currentChat.otherUid]?.lastSeen)}
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="chat-header-right" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', position: 'relative' }} ref={chatMenuRef}>
                    {/* Call Buttons for 1-on-1 */}
                    {currentChat.type !== 'group' && (
                      <>
                        <button
                          type="button"
                          className="action-icon"
                          onClick={() => handleStartCall(false)}
                          title="Voice Call"
                          style={{
                            background: 'transparent',
                            border: 'none',
                            borderRadius: '50%',
                            width: '36px',
                            height: '36px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'var(--color-text-main)',
                            transition: 'all 0.15s ease'
                          }}
                        >
                          <Phone size={19} />
                        </button>
                        <button
                          type="button"
                          className="action-icon"
                          onClick={() => handleStartCall(true)}
                          title="Video Call"
                          style={{
                            background: 'transparent',
                            border: 'none',
                            borderRadius: '50%',
                            width: '36px',
                            height: '36px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'var(--color-text-main)',
                            transition: 'all 0.15s ease'
                          }}
                        >
                          <Video size={19} />
                        </button>
                      </>
                    )}

                    {(currentChat.type === 'group' || currentChat.isGroup) && (
                      <>
                        <button
                          type="button"
                          className={`action-icon ${currentActiveGroupCall ? 'active-call-pulse' : ''}`}
                          onClick={() => {
                            if (!currentActiveGroupCall && !canStartCallInGroup) {
                              showToast('Only group admins can start calls in this group.', 'warning')
                              return
                            }
                            handleStartOrJoinGroupCall(true, currentActiveGroupCall?.id)
                          }}
                          title={
                            currentActiveGroupCall
                              ? 'Pick Call / Join Active Group Video Call'
                              : (!canStartCallInGroup ? 'Only group admins can start calls' : 'Start Group Video Call')
                          }
                          style={{
                            background: currentActiveGroupCall ? 'rgba(16, 185, 129, 0.2)' : 'transparent',
                            border: currentActiveGroupCall ? '1.5px solid #10b981' : 'none',
                            borderRadius: '50%',
                            width: '36px',
                            height: '36px',
                            cursor: (!currentActiveGroupCall && !canStartCallInGroup) ? 'not-allowed' : 'pointer',
                            opacity: (!currentActiveGroupCall && !canStartCallInGroup) ? 0.45 : 1,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: currentActiveGroupCall ? '#10b981' : 'var(--color-text-main)',
                            transition: 'all 0.15s ease',
                            position: 'relative'
                          }}
                        >
                          <Video size={19} />
                          {currentActiveGroupCall && <span className="call-live-indicator-dot" />}
                        </button>
                        <button
                          type="button"
                          className="action-icon"
                          onClick={() => {
                            if (!currentActiveGroupCall && !canStartCallInGroup) {
                              showToast('Only group admins can start calls in this group.', 'warning')
                              return
                            }
                            handleStartOrJoinGroupCall(false, currentActiveGroupCall?.id)
                          }}
                          title={
                            currentActiveGroupCall
                              ? 'Pick Call / Join Active Group Voice Call'
                              : (!canStartCallInGroup ? 'Only group admins can start calls' : 'Start Group Voice Call')
                          }
                          style={{
                            background: 'transparent',
                            border: 'none',
                            borderRadius: '50%',
                            width: '36px',
                            height: '36px',
                            cursor: (!currentActiveGroupCall && !canStartCallInGroup) ? 'not-allowed' : 'pointer',
                            opacity: (!currentActiveGroupCall && !canStartCallInGroup) ? 0.45 : 1,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'var(--color-text-main)',
                            transition: 'all 0.15s ease'
                          }}
                        >
                          <Phone size={19} />
                        </button>
                        <button
                          type="button"
                          className="action-icon"
                          onClick={() => setShowGroupInfoModal(true)}
                          title="Group Info"
                          style={{
                            background: 'transparent',
                            border: 'none',
                            borderRadius: '50%',
                            width: '36px',
                            height: '36px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'var(--color-text-main)',
                            transition: 'all 0.15s ease'
                          }}
                        >
                          <Info size={19} />
                        </button>
                      </>
                    )}

                    {isChatMuted(currentChat.id) && (
                      <span 
                        title="Notifications muted for this chat"
                        style={{ display: 'flex', alignItems: 'center', color: 'var(--color-red)', marginRight: '0.15rem', opacity: 0.85 }}
                      >
                        <BellOff size={18} />
                      </span>
                    )}

                    {/* Single Clean Three-Dot Button */}
                    <button 
                      type="button"
                      className="action-icon" 
                      onClick={() => setShowChatMenu(prev => !prev)} 
                      title="More options"
                      style={{ 
                        background: showChatMenu ? 'var(--color-bg-sidebar)' : 'transparent', 
                        border: 'none', 
                        borderRadius: '50%',
                        width: '36px',
                        height: '36px',
                        cursor: 'pointer', 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center',
                        color: showChatMenu ? 'var(--color-primary)' : 'var(--color-text-main)',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <MoreVertical size={20} />
                    </button>

                    {/* 3-Dot Dropdown Menu */}
                    {showChatMenu && (
                      <div className="chat-dropdown-menu" style={{
                        position: 'absolute',
                        top: '115%',
                        right: 0,
                        background: 'var(--color-bg-main)',
                        border: '1px solid var(--color-border)',
                        borderRadius: 'var(--radius-md)',
                        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.2), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
                        width: '215px',
                        padding: '0.4rem',
                        zIndex: 1000,
                        animation: 'dropdownFadeIn 0.18s cubic-bezier(0.16, 1, 0.3, 1)'
                      }}>
                        <button
                          type="button"
                          className="chat-dropdown-item"
                          onClick={() => {
                            setShowChatMenu(false)
                            openThemeModal('chat')
                          }}
                        >
                          <Palette size={17} />
                          <span>Wallpaper & Theme</span>
                        </button>

                        <button
                          type="button"
                          className="chat-dropdown-item"
                          onClick={() => {
                            setShowChatMenu(false)
                            setIsSelectMode(true)
                          }}
                        >
                          <CheckSquare size={17} />
                          <span>Select Messages</span>
                        </button>

                        <button
                          type="button"
                          className="chat-dropdown-item"
                          onClick={() => {
                            setShowChatMenu(false)
                            toggleChatMute(currentChat.id)
                          }}
                        >
                          {isChatMuted(currentChat.id) ? (
                            <>
                              <Bell size={17} />
                              <span>Unmute Notifications</span>
                            </>
                          ) : (
                            <>
                              <BellOff size={17} />
                              <span>Mute Notifications</span>
                            </>
                          )}
                        </button>

                        <div style={{ height: '1px', background: 'var(--color-border)', margin: '0.35rem 0.25rem' }} />

                        <button
                          type="button"
                          className="chat-dropdown-item danger"
                          onClick={() => {
                            setShowChatMenu(false)
                            confirmClearAllChat()
                          }}
                        >
                          <Trash2 size={17} />
                          <span>Clear All Chat</span>
                        </button>

                        <button
                          type="button"
                          className="chat-dropdown-item danger"
                          onClick={() => {
                            setShowChatMenu(false)
                            setDeleteModal({
                              type: 'unfriend',
                              user: { uid: currentChat.otherUid, email: currentChat.otherEmail }
                            })
                          }}
                        >
                          <UserMinus size={17} />
                          <span>Unfriend</span>
                        </button>
                      </div>
                    )}
                  </div>
                </>
              )}
            </header>

            {/* Active Group Call Banner */}
            {currentActiveGroupCall && (!activeGroupCallSession || activeGroupCallSession.callId !== currentActiveGroupCall.id) && (
              <div className="group-call-active-banner">
                <div className="group-call-banner-left">
                  <span className="live-call-badge">
                    <span className="live-dot" /> LIVE
                  </span>
                  <span className="group-call-banner-text">
                    Group Video Call in progress ({currentActiveGroupCall.participantUids?.length || 1} connected)
                  </span>
                </div>
                <button
                  type="button"
                  className="btn-join-group-call"
                  onClick={() => handleStartOrJoinGroupCall(true, currentActiveGroupCall.id)}
                >
                  <PhoneCall size={16} /> Pick Call / Join
                </button>
              </div>
            )}

            <div 
              className="message-stream" 
              ref={messageStreamRef}
              style={{
                backgroundImage: previewBgImage ? (previewBgImage.startsWith('linear-gradient') ? previewBgImage : `url(${previewBgImage})`) : 'none',
                backgroundSize: previewBgSize === 'stretch' ? '100% 100%' : previewBgSize,
                backgroundPosition: previewBgPosition,
                backgroundRepeat: previewBgSize === 'repeat' ? 'repeat' : 'no-repeat',
                backgroundAttachment: 'scroll',
                backgroundColor: previewBgImage ? (activeChatThemeColor === 'light' ? 'rgba(255,255,255,0.7)' : 'rgba(15,23,42,0.85)') : 'transparent'
              }}
            >
              <div className="message-stream-inner">
                {messages.length === 0 && (
                  <div className="empty-state">
                    <p>
                      {(currentChat.type === 'group' || currentChat.isGroup)
                        ? 'No messages yet in this group. Say hello to everyone!'
                        : `No messages yet. Say hello to ${usersMap[currentChat.otherUid]?.username || currentChat.otherEmail?.split('@')[0] || 'your friend'}!`}
                    </p>
                  </div>
                )}

                {messages.map((msg, idx) => {
                  const isMe = msg.uid === user.uid
                  const isGroup = currentChat.type === 'group'
                  const showHeader = idx === 0 || messages[idx - 1].uid !== msg.uid
                  const senderPhoto = usersMap[msg.uid]?.photoURL
                  const msgStatus = isMe ? getMessageStatus(msg, usersMap[currentChat.otherUid]) : null
                  const isSelected = selectedMsgIds.has(msg.id)

                  const effectiveText = (msg.isEncrypted && decryptedMap[msg.id]?.text) ? decryptedMap[msg.id].text : msg.text
                  const effectiveFileUrl = (msg.isEncrypted && decryptedMap[msg.id]?.fileUrl) ? decryptedMap[msg.id].fileUrl : msg.fileUrl

                  return (
                    <div 
                      key={msg.id} 
                      className={`message-wrapper ${isMe ? 'message-mine' : 'message-theirs'} ${showHeader ? 'mt-4' : 'mt-1'}`}
                    >
                      {/* Multi-Select Checkbox */}
                      {isSelectMode && (
                        <div 
                          className={`message-select-indicator ${isSelected ? 'selected' : ''}`}
                          onClick={(e) => {
                            e.stopPropagation()
                            handleToggleSelectMessage(msg.id)
                          }}
                          title={isSelected ? 'Deselect' : 'Select'}
                        >
                          {isSelected ? (
                            <CheckSquare size={20} color="var(--color-primary)" />
                          ) : (
                            <Square size={20} />
                          )}
                        </div>
                      )}

                      <div className="message-content-wrapper">
                        <div className="message-content">
                          <div 
                            className={`message-bubble ${isMe ? 'bubble-mine' : 'bubble-theirs'} ${isSelectMode ? 'selectable' : ''} ${isSelected ? 'selected' : ''}`}
                            onClick={() => handleMessageBubbleClick(msg, isMe ? msgStatus : 'received')}
                            onDoubleClick={() => handleMessageBubbleDoubleClick(msg, isMe ? msgStatus : 'received')}
                            title={isSelectMode ? 'Click to select' : 'Double tap to view message info'}
                          >
                            {/* Group Sender Label */}
                            {isGroup && !isMe && showHeader && (
                              <div style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--color-primary)', marginBottom: 3 }}>
                                {usersMap[msg.uid]?.username || msg.email?.split('@')[0]}
                              </div>
                            )}

                            {/* Voice Audio Message */}
                            {msg.isAudio && effectiveFileUrl && (
                              <AudioMessageBubble audioUrl={effectiveFileUrl} duration={msg.duration} isMine={isMe} />
                            )}

                            {/* Photo Attachment */}
                            {!msg.isAudio && effectiveFileUrl && (msg.fileType?.startsWith('image/') || msg.isImage) && (
                              <div 
                                className="bubble-image-wrapper"
                                onClick={(e) => {
                                  if (isSelectMode) {
                                    e.stopPropagation()
                                    handleToggleSelectMessage(msg.id)
                                  } else {
                                    e.stopPropagation()
                                    setActiveLightbox({ url: effectiveFileUrl, name: msg.fileName || 'Photo' })
                                  }
                                }}
                                title={isSelectMode ? 'Click to select' : 'Click to view full photo'}
                              >
                                <img src={effectiveFileUrl} alt={msg.fileName || 'Photo'} className="bubble-image" loading="lazy" />
                              </div>
                            )}

                            {/* Document Attachment */}
                            {!msg.isAudio && effectiveFileUrl && !(msg.fileType?.startsWith('image/') || msg.isImage) && (
                              <div 
                                className="bubble-file-card"
                                onClick={(e) => {
                                  if (isSelectMode) {
                                    e.stopPropagation()
                                    handleToggleSelectMessage(msg.id)
                                  }
                                }}
                              >
                                <div className="file-card-icon">
                                  <FileText size={20} />
                                </div>
                                <div className="file-card-details">
                                  <span className="file-card-name" title={msg.fileName}>{msg.fileName || 'Document'}</span>
                                  <span className="file-card-size">{formatFileSize(msg.fileSize)}</span>
                                </div>
                                {!isSelectMode && (
                                  <a 
                                    href={effectiveFileUrl} 
                                    download={msg.fileName || 'file'} 
                                    target="_blank" 
                                    rel="noopener noreferrer" 
                                    className="file-card-download-btn"
                                    title="Download file"
                                  >
                                    <Download size={18} />
                                  </a>
                                )}
                              </div>
                            )}

                            {/* Group Video Call Message Card */}
                            {(msg.isGroupCall || (msg.isSystem && (
                              (typeof effectiveText === 'string' && (effectiveText.includes('group video call') || effectiveText.includes('started a group video call'))) ||
                              (typeof msg.text === 'string' && (msg.text.includes('group video call') || msg.text.includes('started a group video call')))
                            ))) && (() => {
                              const isCallActive = Boolean(
                                currentActiveGroupCall &&
                                ((msg.callId && currentActiveGroupCall.id === msg.callId) ||
                                 (!msg.callId && currentActiveGroupCall.chatId === currentChat.id))
                              )
                              return (
                                <div className={`group-call-message-card ${!isCallActive ? 'ended' : ''}`}>
                                  <div className={`group-call-icon-wrap ${!isCallActive ? 'ended' : ''}`}>
                                    {isCallActive ? <Video size={18} color="#fff" /> : <PhoneOff size={16} />}
                                  </div>
                                  <div className="group-call-card-info">
                                    <span className="group-call-title">Group Video Call</span>
                                    <span className="group-call-subtitle">
                                      {isCallActive ? (effectiveText || msg.text || 'Group video call in progress') : 'Call ended'}
                                    </span>
                                  </div>
                                  {isCallActive ? (
                                    <button
                                      type="button"
                                      className="group-call-join-btn"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        handleStartOrJoinGroupCall(true, msg.callId || currentActiveGroupCall?.id)
                                      }}
                                    >
                                      <PhoneCall size={13} style={{ marginRight: 4 }} /> Pick Call / Join
                                    </button>
                                  ) : (
                                    <span className="group-call-ended-pill">
                                      <PhoneOff size={12} style={{ marginRight: 4 }} /> Ended
                                    </span>
                                  )}
                                </div>
                              )
                            })()}

                            {/* Message Text / Caption */}
                            {!msg.isAudio && !msg.isGroupCall && !(msg.isSystem && (
                              (typeof effectiveText === 'string' && (effectiveText.includes('group video call') || effectiveText.includes('started a group video call'))) ||
                              (typeof msg.text === 'string' && (msg.text.includes('group video call') || msg.text.includes('started a group video call')))
                            )) && effectiveText && (
                              <span className="bubble-text">{effectiveText}</span>
                            )}

                            <span className="bubble-meta" style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                              {msg.isEncrypted && (
                                <span title="End-to-End Encrypted" style={{ opacity: 0.65, display: 'inline-flex', alignItems: 'center' }}>
                                  <Lock size={11} />
                                </span>
                              )}
                              {isMe && (
                                <span className={`msg-tick tick-${msgStatus}`}>
                                  {msgStatus === 'read' ? (
                                    <CheckCheck size={15} className="tick-icon tick-read" color="#53bdeb" />
                                  ) : msgStatus === 'delivered' ? (
                                    <CheckCheck size={15} className="tick-icon tick-delivered" color="#8696a0" />
                                  ) : (
                                    <Check size={15} className="tick-icon tick-sent" color="#8696a0" />
                                  )}
                                </span>
                              )}
                            </span>
                          </div>
                        </div>

                        {/* Single Message Delete Hover Button (Normal Mode) */}
                        {!isSelectMode && (
                          <button
                            type="button"
                            className="msg-hover-action-btn"
                            onClick={(e) => {
                              e.stopPropagation()
                              confirmDeleteSingle(msg)
                            }}
                            title="Delete this message"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}

                {/* Friend Typing Indicator Bubble */}
                {isOtherTyping && (
                  <div className="message-wrapper message-theirs typing-bubble-wrapper">
                    <div className="message-content">
                      <div className="message-bubble bubble-theirs typing-bubble">
                        <span className="typing-indicator-dots">
                          <span className="t-dot"></span>
                          <span className="t-dot"></span>
                          <span className="t-dot"></span>
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="chat-input-container">
              {/* Staged File/Photo Preview Banner */}
              {stagedAttachment && (
                <div className="staged-attachment-bar">
                  <div className="staged-attachment-preview">
                    {stagedAttachment.isImage ? (
                      <img src={stagedAttachment.previewUrl} alt="Preview" className="staged-img-thumb" />
                    ) : (
                      <div className="staged-file-icon">
                        <FileText size={22} />
                      </div>
                    )}
                    <div className="staged-file-info">
                      <span className="staged-file-name">{stagedAttachment.name}</span>
                      <span className="staged-file-size">{formatFileSize(stagedAttachment.size)}</span>
                    </div>
                  </div>
                  <button 
                    type="button" 
                    className="staged-remove-btn" 
                    onClick={handleCancelAttachment}
                    title="Remove attachment"
                    disabled={isUploading}
                  >
                    <X size={18} />
                  </button>
                </div>
              )}

              <form onSubmit={handleSend} className="chat-input-wrapper">
                {/* Hidden File Inputs */}
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleSelectAttachment(e, true)}
                  style={{ display: 'none' }}
                />
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="*/*"
                  onChange={(e) => handleSelectAttachment(e, false)}
                  style={{ display: 'none' }}
                />

                {!canSendInGroup ? (
                  <div className="group-restricted-input-bar">
                    <Lock size={16} className="restricted-icon" />
                    <span>Only group admins can send messages in this group</span>
                  </div>
                ) : isRecordingVoice ? (
                  <VoiceRecorder
                    onSendAudio={handleSendVoiceNote}
                    onCancel={() => setIsRecordingVoice(false)}
                    onError={(msg) => showToast(msg, 'error')}
                  />
                ) : (
                  <>
                    {/* Attachment Action Buttons */}
                    <button
                      type="button"
                      className="attach-btn"
                      onClick={() => imageInputRef.current?.click()}
                      title="Send Photo"
                      disabled={isUploading}
                    >
                      <ImageIcon size={20} />
                    </button>
                    <button
                      type="button"
                      className="attach-btn"
                      onClick={() => fileInputRef.current?.click()}
                      title="Send Document / File"
                      disabled={isUploading}
                    >
                      <Paperclip size={20} />
                    </button>

                    <input
                      ref={chatInputRef}
                      type="text"
                      className="chat-input"
                      value={newMessage}
                      onChange={handleInputChange}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          handleSend(e)
                        }
                      }}
                      placeholder={
                        stagedAttachment
                          ? "Add a caption..."
                          : `Message ${(currentChat.type === 'group' || currentChat.isGroup) ? (currentChat.name || 'Group') : (usersMap[currentChat.otherUid]?.username || currentChat.otherEmail?.split('@')[0] || 'Chat')}...`
                      }
                      disabled={isUploading}
                    />

                    {!(newMessage.trim() || stagedAttachment) ? (
                      <button
                        type="button"
                        className="attach-btn"
                        onClick={() => setIsRecordingVoice(true)}
                        title="Record Voice Note"
                        style={{ color: 'var(--color-primary)' }}
                        disabled={isUploading}
                      >
                        <Mic size={20} />
                      </button>
                    ) : (
                      <button 
                        type="submit" 
                        className={`send-btn active`} 
                        style={{ width: 'auto', padding: '0 1rem', gap: '0.5rem' }}
                        disabled={isUploading}
                        onMouseDown={e => e.preventDefault()}
                        onTouchStart={e => e.preventDefault()}
                      >
                        {isUploading ? (
                          <>
                            <Loader2 size={16} className="animate-spin" />
                            <span style={{ fontWeight: '600', fontSize: '0.9rem' }}>Sending...</span>
                          </>
                        ) : (
                          <>
                            <span style={{ fontWeight: '600', fontSize: '0.9rem' }}>Send</span>
                            <Send size={16} />
                          </>
                        )}
                      </button>
                    )}
                  </>
                )}
              </form>
            </div>
          </>
        ) : (
          <div 
            className={`no-chat-selected ${previewBgImage ? 'has-wallpaper' : ''}`}
            style={{
              backgroundImage: previewBgImage ? (previewBgImage.startsWith('linear-gradient') ? previewBgImage : `url(${previewBgImage})`) : 'none',
              backgroundSize: previewBgSize === 'stretch' ? '100% 100%' : previewBgSize,
              backgroundPosition: previewBgPosition,
              backgroundRepeat: previewBgSize === 'repeat' ? 'repeat' : 'no-repeat',
            }}
          >
            <div className={`empty-chat-glass-card ${previewBgImage ? 'has-wallpaper' : ''}`}>
              <div className="empty-chat-orb-wrapper">
                <div className="empty-chat-orb-glow"></div>
                <div className="empty-chat-orb">
                  <MessageSquare size={previewBgImage ? 22 : 36} className="empty-chat-main-icon" />
                  <div className="empty-chat-sparkle-badge">
                    <Sparkles size={previewBgImage ? 11 : 13} />
                  </div>
                </div>
              </div>
              <div className="empty-chat-text-col">
                <h2 className="empty-chat-title">aja chat kr le</h2>
                <p className="empty-chat-subtitle">Select a conversation from the sidebar or start a new chat</p>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Profile Settings Modal */}
      {showProfileModal && (
        <div className="profile-modal-overlay" onClick={() => setShowProfileModal(false)}>
          <div className="profile-modal" onClick={e => e.stopPropagation()}>
            <div className="profile-modal-header">
              <h3>Edit Profile</h3>
              <button className="close-modal-btn" onClick={() => setShowProfileModal(false)}>
                <X size={20} />
              </button>
            </div>

            <div className="profile-modal-body">
              <div className="profile-photo-upload">
                <div className="profile-photo-preview">
                  {profilePhoto ? (
                    <img src={profilePhoto} alt="Profile Preview" className="avatar-img" />
                  ) : (
                    <User size={48} color="var(--color-text-muted)" />
                  )}
                </div>
                <label className="upload-btn">
                  <Camera size={16} /> Change Photo
                  <input type="file" accept="image/*" onChange={handlePhotoUpload} style={{ display: 'none' }} />
                </label>
              </div>

              <div className="profile-field">
                <label>Username</label>
                <input
                  type="text"
                  className="input-base"
                  placeholder="Set a unique username"
                  value={profileUsername}
                  onChange={(e) => {
                    setProfileUsername(e.target.value)
                    setUsernameError('')
                  }}
                  maxLength={30}
                />
                {usernameError && <span style={{ color: 'var(--color-red)', fontSize: '0.85rem' }}>{usernameError}</span>}
              </div>

              <div className="profile-field" style={{ marginTop: '1rem' }}>
                <label>About Me (Bio)</label>
                <textarea
                  className="input-base"
                  rows="3"
                  placeholder="Hey there! I am using ChatFlow."
                  value={profileBio}
                  onChange={(e) => setProfileBio(e.target.value)}
                  maxLength={100}
                />
                <span className="char-count">{profileBio.length}/100</span>
              </div>
            </div>

            <div className="profile-modal-footer">
              <button className="btn" onClick={() => setShowProfileModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSaveProfile}>Save Changes</button>
            </div>
          </div>
        </div>
      )}

      {/* View Friend Profile Modal - Large, Prominent & Beautiful */}
      {viewProfileUser && (
        <div className="profile-modal-overlay" onClick={() => setViewProfileUser(null)}>
          <div className="friend-profile-modal-card" onClick={e => e.stopPropagation()}>
            {/* Top Gradient Banner with Close Button */}
            <div className="friend-profile-banner">
              <button 
                type="button" 
                className="close-modal-btn" 
                onClick={() => setViewProfileUser(null)}
                title="Close"
              >
                <X size={20} />
              </button>
            </div>

            {/* Profile Content */}
            <div className="friend-profile-content">
              {/* Large Avatar */}
              <div
                className="friend-profile-avatar-wrapper"
                onClick={() => viewProfileUser.photoURL && setFullScreenPhoto(viewProfileUser.photoURL)}
                title={viewProfileUser.photoURL ? 'Click to view full photo' : 'User Avatar'}
              >
                {viewProfileUser.photoURL ? (
                  <img src={viewProfileUser.photoURL} alt="Profile" className="avatar-img" />
                ) : (
                  <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <User size={72} color="var(--color-text-muted)" />
                  </div>
                )}
                {viewProfileUser.photoURL && (
                  <div className="friend-profile-avatar-overlay">
                    <Maximize2 size={22} />
                    <span>View Full</span>
                  </div>
                )}
                <div 
                  className={`friend-profile-status-indicator ${isUserOnline(viewProfileUser) ? 'online' : ''}`}
                  title={isUserOnline(viewProfileUser) ? 'Online' : 'Offline'}
                ></div>
              </div>

              {/* Username / Name */}
              <h3 className="friend-profile-name">
                {viewProfileUser.username || viewProfileUser.email?.split('@')[0] || 'User'}
              </h3>

              {/* Online / Last Seen Pill */}
              <div className={`friend-profile-status-pill ${isUserOnline(viewProfileUser) ? 'online' : 'offline'}`}>
                {isUserOnline(viewProfileUser) ? (
                  <>
                    <span className="online-pulse-dot"></span>
                    <span>Online now</span>
                  </>
                ) : (
                  <span>{formatLastSeen(viewProfileUser?.lastSeen)}</span>
                )}
              </div>

              {/* Detail Items */}
              <div className="friend-profile-details">
                {/* Username Section */}
                <div className="friend-profile-item">
                  <div className="friend-profile-item-label">
                    <User size={13} />
                    <span>Username</span>
                  </div>
                  <div className="friend-profile-email-row">
                    <span className="friend-profile-item-value" style={{ fontWeight: '600', color: 'var(--color-primary)' }}>
                      @{viewProfileUser.username || viewProfileUser.email?.split('@')[0] || 'user'}
                    </span>
                    <button
                      type="button"
                      className="friend-profile-copy-btn"
                      onClick={() => {
                        const uname = viewProfileUser.username || viewProfileUser.email?.split('@')[0] || 'user'
                        navigator.clipboard.writeText(`@${uname}`)
                        setCopiedEmail(true)
                        setTimeout(() => setCopiedEmail(false), 2000)
                      }}
                      title="Copy Username"
                    >
                      {copiedEmail ? (
                        <>
                          <Check size={14} color="var(--color-green)" />
                          <span style={{ color: 'var(--color-green)', fontWeight: '600' }}>Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy size={14} />
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* About / Bio Section */}
                <div className="friend-profile-item">
                  <div className="friend-profile-item-label">
                    <Info size={13} />
                    <span>About / Bio</span>
                  </div>
                  <div className="friend-profile-item-value" style={{ fontStyle: viewProfileUser.bio ? 'normal' : 'italic', color: viewProfileUser.bio ? 'var(--color-text-main)' : 'var(--color-text-muted)' }}>
                    {viewProfileUser.bio ? `"${viewProfileUser.bio}"` : "This user hasn't written a bio yet."}
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="friend-profile-actions">
                {viewProfileUser.photoURL && (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setFullScreenPhoto(viewProfileUser.photoURL)}
                  >
                    <Maximize2 size={16} />
                    <span>View Full Photo</span>
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => setViewProfileUser(null)}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Full Screen Photo Modal - High Definition & Immersive */}
      {fullScreenPhoto && (
        <div className="fullscreen-lightbox-overlay" onClick={() => setFullScreenPhoto(null)}>
          <div className="fullscreen-lightbox-topbar">
            <span className="fullscreen-lightbox-title">
              {viewProfileUser?.username || viewProfileUser?.email?.split('@')[0] || 'Profile Photo'}
            </span>
            <button
              type="button"
              className="fullscreen-lightbox-close"
              onClick={() => setFullScreenPhoto(null)}
              title="Close"
            >
              <X size={22} />
            </button>
          </div>

          <div className="fullscreen-lightbox-image-box" onClick={e => e.stopPropagation()}>
            <img
              src={fullScreenPhoto}
              alt="Profile Full Screen"
              className="fullscreen-lightbox-img"
            />
          </div>
        </div>
      )}

      {/* Message Info Modal */}
      {messageReadInfo && (
        <div className="profile-modal-overlay" onClick={() => setMessageReadInfo(null)}>
          <div className="profile-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '360px' }}>
            <div className="profile-modal-header">
              <h3>Message Details</h3>
              <button className="close-modal-btn" onClick={() => setMessageReadInfo(null)}>
                <X size={20} />
              </button>
            </div>
            <div className="profile-modal-body">
              {/* Message Preview */}
              <div style={{ background: 'var(--color-bg-sidebar)', padding: '0.85rem 1rem', borderRadius: 'var(--radius-md)', marginBottom: '1.25rem', border: '1px solid var(--color-border)' }}>
                <div style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--color-text-muted)', marginBottom: '0.35rem' }}>
                  {messageReadInfo.uid === user.uid ? 'You' : (usersMap[messageReadInfo.uid]?.username || messageReadInfo.email?.split('@')[0])}
                </div>
                <p style={{ color: 'var(--color-text-main)', fontSize: '0.98rem', wordBreak: 'break-word', margin: 0, lineHeight: 1.45 }}>
                  {messageReadInfo.text ? `"${messageReadInfo.text}"` : (messageReadInfo.fileUrl ? (messageReadInfo.isImage || messageReadInfo.fileType?.startsWith('image/') ? '📷 Photo' : `📎 ${messageReadInfo.fileName || 'File'}`) : '')}
                </p>
              </div>
              
              {messageReadInfo.uid === user.uid ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                  {/* Read At */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                      <CheckCheck size={18} className="tick-read" color="#53bdeb" />
                      <span style={{ fontWeight: '600', fontSize: '0.9rem' }}>Read</span>
                    </div>
                    <span style={{ fontSize: '0.8rem', color: messageReadInfo.computedStatus === 'read' ? 'var(--color-text-main)' : 'var(--color-text-muted)' }}>
                      {messageReadInfo.readAt?.toDate ? messageReadInfo.readAt.toDate().toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : (messageReadInfo.computedStatus === 'read' ? 'Read' : 'Not read yet')}
                    </span>
                  </div>

                  <div style={{ height: '1px', background: 'var(--color-border)' }}></div>

                  {/* Delivered At */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                      <CheckCheck size={18} className="tick-delivered" style={{ color: '#8696a0' }} />
                      <span style={{ fontWeight: '600', fontSize: '0.9rem' }}>Delivered</span>
                    </div>
                    <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                      {messageReadInfo.deliveredAt?.toDate ? messageReadInfo.deliveredAt.toDate().toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : (messageReadInfo.computedStatus === 'delivered' || messageReadInfo.computedStatus === 'read' ? 'Delivered' : 'Waiting for network/device')}
                    </span>
                  </div>

                  <div style={{ height: '1px', background: 'var(--color-border)' }}></div>

                  {/* Sent At */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                      <Check size={18} className="tick-sent" style={{ color: '#8696a0' }} />
                      <span style={{ fontWeight: '600', fontSize: '0.9rem' }}>Sent</span>
                    </div>
                    <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                      {messageReadInfo.createdAt?.toDate ? messageReadInfo.createdAt.toDate().toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'Sent'}
                    </span>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                  {/* Sent At (Friend's messages only show when they sent it) */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                      <Check size={18} className="tick-sent" style={{ color: '#8696a0' }} />
                      <span style={{ fontWeight: '600', fontSize: '0.9rem' }}>Sent</span>
                    </div>
                    <span style={{ fontSize: '0.82rem', color: 'var(--color-text-main)', fontWeight: '500' }}>
                      {messageReadInfo.createdAt?.toDate ? messageReadInfo.createdAt.toDate().toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'Sent'}
                    </span>
                  </div>
                </div>
              )}

              {/* Delete Message Button */}
              <button
                type="button"
                className="selection-btn selection-btn-danger"
                style={{ width: '100%', marginTop: '1.25rem', padding: '0.6rem', justifyContent: 'center' }}
                onClick={() => {
                  confirmDeleteSingle(messageReadInfo)
                }}
              >
                <Trash2 size={16} />
                <span>Delete Message</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Unified On-Screen Delete Confirmation Modal */}
      {deleteModal && (
        <div className="profile-modal-overlay" onClick={() => !isDeleting && setDeleteModal(null)}>
          <div 
            className="profile-modal" 
            onClick={e => e.stopPropagation()} 
            style={{ 
              maxWidth: '380px', 
              textAlign: 'center', 
              padding: '1.75rem 1.5rem',
              animation: 'modalSlideUp 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
            }}
          >
            <div className="danger-modal-icon">
              <Trash2 size={26} />
            </div>

            <h3 style={{ fontSize: '1.2rem', fontWeight: '700', marginBottom: '0.5rem', color: 'var(--color-text-main)' }}>
              {deleteModal.type === 'single' && 'Delete for Me?'}
              {deleteModal.type === 'multiple' && `Delete ${deleteModal.count} Messages for Me?`}
              {deleteModal.type === 'all' && 'Clear Chat for Me?'}
              {deleteModal.type === 'unfriend' && 'Unfriend User?'}
            </h3>

            {deleteModal.type === 'single' && (
              <>
                <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.88rem', lineHeight: '1.45', marginBottom: '0.9rem' }}>
                  This message will be removed from your chat. It will still remain visible to your friend.
                </p>
                {deleteModal.msg?.text && (
                  <div style={{
                    background: 'var(--color-bg-secondary)',
                    border: '1px solid var(--color-border)',
                    borderRadius: '8px',
                    padding: '0.6rem 0.85rem',
                    marginBottom: '1.25rem',
                    fontSize: '0.85rem',
                    color: 'var(--color-text-main)',
                    maxHeight: '70px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    fontStyle: 'italic',
                    textAlign: 'left'
                  }}>
                    "{deleteModal.msg.text}"
                  </div>
                )}
                {deleteModal.msg?.fileUrl && !deleteModal.msg?.text && (
                  <div style={{
                    background: 'var(--color-bg-secondary)',
                    border: '1px solid var(--color-border)',
                    borderRadius: '8px',
                    padding: '0.6rem 0.85rem',
                    marginBottom: '1.25rem',
                    fontSize: '0.85rem',
                    color: 'var(--color-text-secondary)',
                    fontStyle: 'italic'
                  }}>
                    {deleteModal.msg.isImage || deleteModal.msg.fileType?.startsWith('image/') ? '📷 Photo Attachment' : `📎 ${deleteModal.msg.fileName || 'File Attachment'}`}
                  </div>
                )}
              </>
            )}

            {deleteModal.type === 'multiple' && (
              <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.88rem', lineHeight: '1.45', marginBottom: '1.25rem' }}>
                Are you sure you want to delete <strong>{deleteModal.count}</strong> selected messages from your chat? They will still remain visible to your friend.
              </p>
            )}

            {deleteModal.type === 'all' && (
              <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.88rem', lineHeight: '1.45', marginBottom: '1.25rem' }}>
                Are you sure you want to clear all messages with <strong>{usersMap[currentChat?.otherUid]?.username || currentChat?.otherEmail?.split('@')[0]}</strong>? Messages will be cleared from your side only, and your friend will keep their chat history intact.
              </p>
            )}

            {deleteModal.type === 'unfriend' && (
              <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.88rem', lineHeight: '1.45', marginBottom: '1.25rem' }}>
                Are you sure you want to unfriend <strong>@{usersMap[deleteModal.user?.uid]?.username || deleteModal.user?.username || deleteModal.user?.email?.split('@')[0] || 'user'}</strong>? Your chat conversation with this person will be removed.
              </p>
            )}

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
              <button 
                type="button"
                className="btn" 
                onClick={() => setDeleteModal(null)}
                disabled={isDeleting}
                style={{ minWidth: '95px' }}
              >
                Cancel
              </button>
              <button 
                type="button"
                className="btn selection-btn-danger" 
                onClick={() => {
                  if (deleteModal.type === 'single') {
                    executeDeleteSingle(deleteModal.msg)
                  } else if (deleteModal.type === 'multiple') {
                    executeDeleteSelected()
                  } else if (deleteModal.type === 'all') {
                    executeClearAllChat()
                  } else if (deleteModal.type === 'unfriend') {
                    executeUnfriend(deleteModal.user)
                  }
                }}
                disabled={isDeleting}
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center',
                  gap: '0.4rem',
                  minWidth: '105px'
                }}
              >
                {isDeleting ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>Processing...</span>
                  </>
                ) : (
                  <>
                    {deleteModal.type === 'unfriend' ? <UserMinus size={16} /> : <Trash2 size={16} />}
                    <span>{deleteModal.type === 'all' ? 'Clear for Me' : deleteModal.type === 'unfriend' ? 'Unfriend' : 'Delete for Me'}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Theme Settings Modal */}
      {themeModalTarget && (
        <div className="profile-modal-overlay" onClick={() => setThemeModalTarget(null)}>
          <div className="profile-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '480px', width: '95%', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
            <div className="profile-modal-header">
              <h3>{themeModalTarget === 'global' ? 'Global Theme & Wallpaper (Full App)' : 'Chat Theme & Wallpaper (This Chat Only)'}</h3>
              <button className="close-modal-btn" onClick={() => setThemeModalTarget(null)}>
                <X size={20} />
              </button>
            </div>
            
            <div className="profile-modal-body" style={{ overflowY: 'auto', paddingRight: '1rem' }}>
              {themeModalTarget === 'global' && (
                <div className="profile-field" style={{ marginBottom: '1.25rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', fontSize: '0.88rem' }}>
                    Apply Theme To
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.65rem' }}>
                    <button
                      type="button"
                      onClick={() => setGlobalApplyScope('all')}
                      style={{
                        padding: '0.75rem 0.85rem',
                        borderRadius: '10px',
                        border: globalApplyScope === 'all' ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
                        background: globalApplyScope === 'all' ? 'var(--color-primary-light)' : 'var(--color-bg-sidebar)',
                        cursor: 'pointer',
                        textAlign: 'left',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.3rem',
                        boxShadow: globalApplyScope === 'all' ? '0 0 0 2px var(--color-primary-light)' : 'none',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontWeight: '600', fontSize: '0.86rem', color: globalApplyScope === 'all' ? 'var(--color-primary)' : 'var(--color-text-main)' }}>
                        <span style={{ fontSize: '1.15rem' }}>🌐</span>
                        <span>All Screens</span>
                      </div>
                      <span style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary)', lineHeight: '1.3' }}>
                        Apply to all chats, even those with custom themes
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setGlobalApplyScope('remaining')}
                      style={{
                        padding: '0.75rem 0.85rem',
                        borderRadius: '10px',
                        border: globalApplyScope === 'remaining' ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
                        background: globalApplyScope === 'remaining' ? 'var(--color-primary-light)' : 'var(--color-bg-sidebar)',
                        cursor: 'pointer',
                        textAlign: 'left',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.3rem',
                        boxShadow: globalApplyScope === 'remaining' ? '0 0 0 2px var(--color-primary-light)' : 'none',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontWeight: '600', fontSize: '0.86rem', color: globalApplyScope === 'remaining' ? 'var(--color-primary)' : 'var(--color-text-main)' }}>
                        <span style={{ fontSize: '1.15rem' }}>💬</span>
                        <span>Remaining Screens</span>
                      </div>
                      <span style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary)', lineHeight: '1.3' }}>
                        Only apply to chats without any custom theme
                      </span>
                    </button>
                  </div>
                </div>
              )}

              <div className="profile-field" style={{ marginBottom: '1.25rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600' }}>Color Theme</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.6rem' }}>
                  <button
                    type="button"
                    onClick={() => setModalThemeColor('light')}
                    style={{
                      padding: '0.65rem 0.5rem',
                      borderRadius: '8px',
                      border: modalThemeColor === 'light' ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
                      background: '#ffffff',
                      color: '#0f172a',
                      cursor: 'pointer',
                      fontWeight: '600',
                      fontSize: '0.82rem',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '0.35rem',
                      boxShadow: modalThemeColor === 'light' ? '0 0 0 2px var(--color-primary-light)' : 'none',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <span style={{ fontSize: '1.1rem' }}>☀️</span>
                    <span>Light</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setModalThemeColor('dark')}
                    style={{
                      padding: '0.65rem 0.5rem',
                      borderRadius: '8px',
                      border: modalThemeColor === 'dark' ? '2px solid var(--color-primary)' : '1px solid #334155',
                      background: '#0f172a',
                      color: '#f8fafc',
                      cursor: 'pointer',
                      fontWeight: '600',
                      fontSize: '0.82rem',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '0.35rem',
                      boxShadow: modalThemeColor === 'dark' ? '0 0 0 2px var(--color-primary-light)' : 'none',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <span style={{ fontSize: '1.1rem' }}>🌙</span>
                    <span>Dark</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setModalThemeColor('blue')}
                    style={{
                      padding: '0.65rem 0.5rem',
                      borderRadius: '8px',
                      border: modalThemeColor === 'blue' ? '2px solid var(--color-primary)' : '1px solid #1e294f',
                      background: '#0b1329',
                      color: '#38bdf8',
                      cursor: 'pointer',
                      fontWeight: '600',
                      fontSize: '0.82rem',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '0.35rem',
                      boxShadow: modalThemeColor === 'blue' ? '0 0 0 2px var(--color-primary-light)' : 'none',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <span style={{ fontSize: '1.1rem' }}>🌌</span>
                    <span>Midnight</span>
                  </button>
                </div>
              </div>

              <div className="profile-field" style={{ marginBottom: '1.25rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600' }}>Wallpaper Presets</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem', marginBottom: '0.85rem' }}>
                  {[
                    { label: 'None', val: '' },
                    { label: 'Deep Slate', val: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)' },
                    { label: 'Midnight Indigo', val: 'linear-gradient(135deg, #090d16 0%, #1e1b4b 50%, #0f172a 100%)' },
                    { label: 'Cyber Blue', val: 'linear-gradient(135deg, #021B32 0%, #083358 50%, #0d2137 100%)' },
                    { label: 'Emerald Forest', val: 'linear-gradient(135deg, #022c22 0%, #064e3b 50%, #022c22 100%)' }
                  ].map(preset => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => setModalBgImage(preset.val)}
                      style={{
                        padding: '0.35rem 0.65rem',
                        fontSize: '0.75rem',
                        fontWeight: '500',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        border: modalBgImage === preset.val ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
                        background: preset.val || 'var(--color-bg-sidebar)',
                        color: preset.val ? '#ffffff' : 'var(--color-text-main)'
                      }}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>

                <label style={{ display: 'block', marginBottom: '0.4rem', fontWeight: '600', fontSize: '0.85rem' }}>Custom Image</label>
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                  <div style={{ width: '80px', height: '90px', borderRadius: '6px', background: modalBgImage ? (modalBgImage.startsWith('linear-gradient') ? modalBgImage : `url(${modalBgImage}) center/cover no-repeat`) : 'var(--color-bg-sidebar)', overflow: 'hidden', border: '1px solid var(--color-border)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {!modalBgImage && (
                      <span style={{ color: 'var(--color-text-muted)', fontSize: '0.72rem' }}>None</span>
                    )}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <label className="upload-btn" style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.4rem 0.8rem', background: 'var(--color-primary)', color: '#fff', borderRadius: '6px', fontSize: '0.8rem', fontWeight: '500' }}>
                      <Camera size={16} /> Choose Image
                      <input type="file" accept="image/*" onChange={handleThemePhotoUpload} style={{ display: 'none' }} />
                    </label>
                    {modalBgImage && (
                      <button 
                        type="button"
                        className="btn" 
                        onClick={() => setModalBgImage('')}
                        style={{ padding: '0.25rem 0.5rem', fontSize: '0.78rem', color: 'var(--color-red)', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                      >
                        Remove Wallpaper
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {modalBgImage && !modalBgImage.startsWith('linear-gradient') && (
                <div className="wallpaper-interactive-container">
                  <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem', fontWeight: '600', fontSize: '0.85rem' }}>
                    <span>Live Framing & Focus</span>
                    <span style={{ fontSize: '0.72rem', color: 'var(--color-primary)', fontWeight: 'normal' }}>
                      Click on face to center it
                    </span>
                  </label>

                  {/* Interactive Mini Chat Preview */}
                  <div 
                    className="wallpaper-preview-interactive"
                    style={{
                      backgroundImage: `url(${modalBgImage})`,
                      backgroundSize: modalBgSize === 'stretch' ? '100% 100%' : modalBgSize,
                      backgroundPosition: `${modalBgPosX}% ${modalBgPosY}%`,
                      backgroundRepeat: modalBgSize === 'repeat' ? 'repeat' : 'no-repeat',
                      backgroundColor: modalThemeColor === 'light' ? 'rgba(255,255,255,0.7)' : 'rgba(15,23,42,0.85)'
                    }}
                    onClick={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect()
                      const rawX = ((e.clientX - rect.left) / rect.width) * 100
                      const rawY = ((e.clientY - rect.top) / rect.height) * 100
                      updatePosition(rawX, rawY)
                    }}
                    onMouseMove={(e) => {
                      if (e.buttons === 1) {
                        const rect = e.currentTarget.getBoundingClientRect()
                        const rawX = ((e.clientX - rect.left) / rect.width) * 100
                        const rawY = ((e.clientY - rect.top) / rect.height) * 100
                        updatePosition(rawX, rawY)
                      }
                    }}
                    onTouchMove={(e) => {
                      if (e.touches && e.touches[0]) {
                        const rect = e.currentTarget.getBoundingClientRect()
                        const rawX = ((e.touches[0].clientX - rect.left) / rect.width) * 100
                        const rawY = ((e.touches[0].clientY - rect.top) / rect.height) * 100
                        updatePosition(rawX, rawY)
                      }
                    }}
                    title="Click or drag anywhere to focus on that point"
                  >
                    {/* Simulated mini chat bubbles */}
                    <div style={{ padding: '10px', pointerEvents: 'none', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                        <div style={{ 
                          background: modalThemeColor === 'light' ? 'rgba(255,255,255,0.92)' : 'rgba(30,41,59,0.92)', 
                          color: modalThemeColor === 'light' ? '#0f172a' : '#f8fafc',
                          borderRadius: '8px', 
                          padding: '4px 9px', 
                          fontSize: '0.72rem',
                          fontWeight: '500',
                          boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
                          backdropFilter: 'blur(4px)'
                        }}>
                          Hey! 👋
                        </div>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <div style={{ 
                          background: 'var(--color-primary)', 
                          color: '#ffffff',
                          borderRadius: '8px', 
                          padding: '4px 9px', 
                          fontSize: '0.72rem',
                          fontWeight: '500',
                          boxShadow: '0 2px 6px rgba(0,0,0,0.2)'
                        }}>
                          Looking great! 📸
                        </div>
                      </div>
                    </div>

                    <div style={{
                      position: 'absolute',
                      bottom: '8px',
                      right: '8px',
                      background: 'rgba(0,0,0,0.72)',
                      color: '#fff',
                      padding: '2px 7px',
                      borderRadius: '4px',
                      fontSize: '0.68rem',
                      fontWeight: '700',
                      backdropFilter: 'blur(4px)',
                      pointerEvents: 'none'
                    }}>
                      📍 {modalBgPosX}% , {modalBgPosY}%
                    </div>

                    <div style={{
                      position: 'absolute',
                      top: '8px',
                      left: '8px',
                      background: 'rgba(0,0,0,0.72)',
                      color: '#fff',
                      padding: '2px 7px',
                      borderRadius: '4px',
                      fontSize: '0.68rem',
                      backdropFilter: 'blur(4px)',
                      pointerEvents: 'none'
                    }}>
                      👆 Click on face to position
                    </div>
                  </div>

                  {/* Quick Focus Presets */}
                  <div style={{ marginBottom: '0.75rem' }}>
                    <span style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)', fontWeight: '600', display: 'block', marginBottom: '0.35rem' }}>
                      Quick Framing Presets:
                    </span>
                    <div className="wallpaper-presets-row">
                      <button
                        type="button"
                        className={`wallpaper-preset-btn ${modalBgPosY <= 20 && modalBgPosY > 0 ? 'active' : ''}`}
                        onClick={() => updatePosition(50, 15)}
                        title="Focus on Face / Upper body (Portrait)"
                      >
                        👤 Face Focus (15%)
                      </button>
                      <button
                        type="button"
                        className={`wallpaper-preset-btn ${modalBgPosY === 0 ? 'active' : ''}`}
                        onClick={() => updatePosition(50, 0)}
                        title="Top edge of photo"
                      >
                        ⬆️ Top (0%)
                      </button>
                      <button
                        type="button"
                        className={`wallpaper-preset-btn ${modalBgPosY === 50 && modalBgPosX === 50 ? 'active' : ''}`}
                        onClick={() => updatePosition(50, 50)}
                        title="Center of photo"
                      >
                        🎯 Center (50%)
                      </button>
                      <button
                        type="button"
                        className={`wallpaper-preset-btn ${modalBgPosY === 100 ? 'active' : ''}`}
                        onClick={() => updatePosition(50, 100)}
                        title="Bottom of photo"
                      >
                        ⬇️ Bottom (100%)
                      </button>
                    </div>
                  </div>

                  {/* Fine Adjustment Sliders */}
                  <div className="wallpaper-slider-group">
                    <div className="wallpaper-slider-row">
                      <div className="wallpaper-slider-header">
                        <span>Vertical Position (Move Face / Body Up or Down)</span>
                        <span className="wallpaper-slider-val">{modalBgPosY}%</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={modalBgPosY}
                        onChange={(e) => updatePosition(modalBgPosX, Number(e.target.value))}
                        className="wallpaper-slider"
                      />
                      <div className="wallpaper-slider-markers">
                        <span>👤 Top / Face (0%)</span>
                        <span>Center (50%)</span>
                        <span>Bottom (100%)</span>
                      </div>
                    </div>

                    <div className="wallpaper-slider-row">
                      <div className="wallpaper-slider-header">
                        <span>Horizontal Position (Left / Right)</span>
                        <span className="wallpaper-slider-val">{modalBgPosX}%</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={modalBgPosX}
                        onChange={(e) => updatePosition(Number(e.target.value), modalBgPosY)}
                        className="wallpaper-slider"
                      />
                      <div className="wallpaper-slider-markers">
                        <span>Left (0%)</span>
                        <span>Center (50%)</span>
                        <span>Right (100%)</span>
                      </div>
                    </div>
                  </div>

                  {/* Sizing Mode Selection */}
                  <div className="profile-field">
                    <label>Wallpaper Sizing Mode</label>
                    <select 
                      className="input-base" 
                      value={modalBgSize}
                      onChange={(e) => setModalBgSize(e.target.value)}
                    >
                      <option value="cover">Full Screen (Cover - fills screen, use sliders above to choose area)</option>
                      <option value="contain">Fit Whole Photo (Contain - shows 100% of photo, no cropping)</option>
                      <option value="auto 100%">Fit Full Height (Top to bottom complete)</option>
                      <option value="100% auto">Fit Full Width (Side to side complete)</option>
                      <option value="stretch">Stretch to Screen</option>
                      <option value="repeat">Tile / Repeat</option>
                    </select>
                  </div>
                </div>
              )}
            </div>

            <div className="profile-modal-footer">
              <button className="btn" onClick={() => setThemeModalTarget(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSaveTheme}>Save Theme</button>
            </div>
          </div>
        </div>
      )}

      {/* Photo Lightbox Modal */}
      {activeLightbox && (
        <div className="image-lightbox-overlay" onClick={() => setActiveLightbox(null)}>
          <div className="image-lightbox-header" onClick={(e) => e.stopPropagation()}>
            <a 
              href={activeLightbox.url} 
              download={activeLightbox.name || 'photo.jpg'} 
              target="_blank" 
              rel="noopener noreferrer" 
              className="image-lightbox-btn"
              title="Download full image"
            >
              <Download size={20} />
            </a>
            <button 
              type="button" 
              className="image-lightbox-btn" 
              onClick={() => setActiveLightbox(null)}
              title="Close"
            >
              <X size={22} />
            </button>
          </div>
          <img 
            src={activeLightbox.url} 
            alt={activeLightbox.name || 'Enlarged photo'} 
            className="image-lightbox-img" 
            onClick={(e) => e.stopPropagation()} 
          />
        </div>
      )}

      {/* Incoming WebRTC Call Dialog */}
      {incomingCall && (
        <IncomingCallDialog
          incomingCall={incomingCall}
          onAccept={handleAcceptCall}
          onDecline={handleDeclineCall}
        />
      )}

      {/* Active WebRTC Call Session Modal */}
      {activeCallSession && (
        <CallModal
          callSession={activeCallSession}
          onClose={() => setActiveCallSession(null)}
        />
      )}

      {/* Active Multi-Party Group Video Call Modal */}
      {activeGroupCallSession && (
        <GroupCallModal
          groupChat={activeGroupCallSession.groupChat}
          callSession={activeGroupCallSession}
          currentUser={user}
          usersMap={usersMap}
          onClose={() => {
            if (activeGroupCallSession?.isHost) {
              activeGroupCallSession.endCallForEveryone()
            } else if (activeGroupCallSession?.leaveCall) {
              activeGroupCallSession.leaveCall()
            }
            setActiveGroupCallSession(null)
          }}
        />
      )}

      {/* Create Group Modal */}
      {showCreateGroupModal && (
        <CreateGroupModal
          currentUser={user}
          usersList={Object.values(usersMap)}
          onClose={() => setShowCreateGroupModal(false)}
          onGroupCreated={(newGroup) => {
            setCurrentChat(newGroup)
          }}
        />
      )}

      {/* Group Info & Members Modal */}
      {showGroupInfoModal && (
        <GroupInfoModal
          currentGroup={currentChat}
          currentUser={user}
          usersMap={usersMap}
          showToast={showToast}
          onClose={() => setShowGroupInfoModal(false)}
          onStartVideoCall={() => {
            setShowGroupInfoModal(false)
            handleStartOrJoinGroupCall(true)
          }}
          onLeftGroup={() => {
            setCurrentChat(null)
          }}
        />
      )}
    </div>
  )
}
