import React, { useState, useEffect, useRef } from 'react'
import { auth, db } from '../firebase'
import { collection, query, orderBy, limit, onSnapshot, addDoc, serverTimestamp, where, getDocs, doc, updateDoc, deleteDoc, setDoc, increment } from 'firebase/firestore'
import { LogOut, Send, Settings, Search, User, UserPlus, Check, X, MessageSquare, ChevronLeft, Camera, Palette, CheckCheck, Info } from 'lucide-react'

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

  // Profile settings state
  const [showProfileModal, setShowProfileModal] = useState(false)
  const [viewProfileUser, setViewProfileUser] = useState(null)
  const [fullScreenPhoto, setFullScreenPhoto] = useState(null)
  const [profileBio, setProfileBio] = useState('')
  const [profileUsername, setProfileUsername] = useState('')
  const [usernameError, setUsernameError] = useState('')
  const [profilePhoto, setProfilePhoto] = useState('')
  const [usersMap, setUsersMap] = useState({}) // { uid: { email, bio, photoURL } }
  
  // Theme settings state
  const [themeModalTarget, setThemeModalTarget] = useState(null)
  const [messageReadInfo, setMessageReadInfo] = useState(null)
  const [modalThemeColor, setModalThemeColor] = useState('light')
  const [modalBgImage, setModalBgImage] = useState('')
  const [modalBgSize, setModalBgSize] = useState('cover')
  const [modalBgPosition, setModalBgPosition] = useState('center')
  
  const activeSettings = React.useMemo(() => {
    const ts = usersMap[user?.uid]?.themeSettings || {}
    if (currentChat && ts.perChat && ts.perChat[currentChat.id]) {
      return ts.perChat[currentChat.id]
    }
    return ts.global || ts
  }, [usersMap, user?.uid, currentChat])
  
  const themeColor = activeSettings.themeColor || 'light'
  const bgImage = activeSettings.bgImage || ''
  const bgSize = activeSettings.bgSize || 'cover'
  const bgPosition = activeSettings.bgPosition || 'center'

  const messageStreamRef = useRef(null)
  const previousChatsRef = useRef({})
  const chatInputRef = useRef(null)

  // Manage Online Status
  useEffect(() => {
    if (!user?.uid) return
    const userRef = doc(db, 'users', user.uid)

    const setOnline = async (isOnline) => {
      try {
        await updateDoc(userRef, { online: isOnline })
      } catch (err) { }
    }

    setOnline(true)

    const handleVisibilityChange = () => setOnline(document.visibilityState === 'visible')
    const handleBeforeUnload = () => setOnline(false)

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('beforeunload', handleBeforeUnload)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('beforeunload', handleBeforeUnload)
      setOnline(false)
    }
  }, [user.uid])

  // Request Notification Permissions on mount
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
    }
  }, [])

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

  // Auto-sync user to db (initial registration guard)
  useEffect(() => {
    const syncUserToDb = async () => {
      try {
        await setDoc(doc(db, 'users', user.uid), {
          uid: user.uid,
          email: user.email,
        }, { merge: true });
      } catch (err) {
        console.error('Error syncing user to DB:', err);
      }
    };
    syncUserToDb();
  }, [user]);

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
      const seenEmails = new Set()

      snapshot.forEach(docSnap => {
        const data = docSnap.data()
        const otherEmail = data.participantEmails.find(e => e !== user.email) || 'Unknown'
        const otherUid = data.participants.find(p => p !== user.uid)

        if (!seenEmails.has(otherEmail)) {
          seenEmails.add(otherEmail)

          const chatData = { id: docSnap.id, otherEmail, otherUid, ...data }
          c.push(chatData)

          // Auto-clear unread count if we are currently looking at this chat!
          if (currentChat && currentChat.id === chatData.id && chatData.unreadCount?.[user.uid] > 0) {
            updateDoc(doc(db, 'chats', chatData.id), {
              [`unreadCount.${user.uid}`]: 0
            }).catch(e => console.error(e))
          }

          // Check for new notifications
          const prevChat = previousChatsRef.current[docSnap.id]
          if (
            prevChat &&
            chatData.lastMessageTime &&
            chatData.lastMessageSender !== user.uid &&
            (!prevChat.lastMessageTime || chatData.lastMessageTime.toMillis() > prevChat.lastMessageTime.toMillis())
          ) {
            // Only notify if we are NOT currently looking at this chat
            if (!currentChat || currentChat.id !== chatData.id) {
              if ('Notification' in window && Notification.permission === 'granted') {
                new Notification(otherEmail.split('@')[0], {
                  body: chatData.lastMessage
                })
              }
            }
          }

          // Store current state for future comparisons
          previousChatsRef.current[docSnap.id] = chatData
        }
      })

      // Sort chats by most recent message
      c.sort((a, b) => {
        const timeA = a.lastMessageTime?.toMillis() || 0
        const timeB = b.lastMessageTime?.toMillis() || 0
        return timeB - timeA
      })

      setChats(c)
    })
    return () => unsubscribe()
  }, [user.uid, user.email, currentChat])

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

      // If there are more than 50 messages, only keep the latest 50
      if (msgs.length > 50) {
        setMessages(msgs.slice(msgs.length - 50))
      } else {
        setMessages(msgs)
      }
    })

    return () => unsubscribe()
  }, [currentChat])

  // Scroll to bottom of messages safely
  useEffect(() => {
    if (messageStreamRef.current) {
      // Use scrollTop instead of scrollIntoView to prevent the entire mobile page from jumping
      messageStreamRef.current.scrollTop = messageStreamRef.current.scrollHeight
    }
  }, [messages])

  // Search logic
  useEffect(() => {
    const searchUsers = async () => {
      if (!searchQuery.trim()) {
        setSearchResults([])
        setIsSearching(false)
        return
      }

      setIsSearching(true)
      try {
        const lowerQuery = searchQuery.toLowerCase();
        // Since we already have usersMap, we could search locally, but let's stick to the db query for now
        const querySnapshot = await getDocs(collection(db, 'users'));
        const results = [];
        querySnapshot.forEach((doc) => {
          const data = doc.data();
          if (data.email && data.email.toLowerCase().includes(lowerQuery)) {
            results.push(data);
          }
        });
        setSearchResults(results.slice(0, 5));
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

  const handleSend = async (e) => {
    e.preventDefault()
    if (!newMessage.trim() || !currentChat) return

    const messageText = newMessage
    setNewMessage('')

    const otherUid = currentChat.participants.find(p => p !== user.uid)

    try {
      // 1. Save the actual message
      await addDoc(collection(db, 'messages'), {
        text: messageText,
        chatId: currentChat.id,
        uid: user.uid,
        email: user.email,
        createdAt: serverTimestamp()
      })

      // 2. Update the chat document with the last message preview AND increment the other person's unread count
      await updateDoc(doc(db, 'chats', currentChat.id), {
        lastMessage: messageText,
        lastMessageSender: user.uid,
        lastMessageTime: serverTimestamp(),
        [`unreadCount.${otherUid}`]: increment(1)
      })
    } catch (err) {
      console.error('Error sending message:', err)
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
    // If clicking the already open chat, close it!
    if (currentChat?.id === chat.id) {
      setCurrentChat(null)
      return
    }

    setCurrentChat(chat)

    // Add a state to the browser history so the physical back button works on Android/iOS
    window.history.pushState({ chatOpen: true }, '')

    // Instantly clear the unread count when clicking on a chat
    if (chat.unreadCount?.[user.uid] > 0) {
      try {
        await updateDoc(doc(db, 'chats', chat.id), {
          [`unreadCount.${user.uid}`]: 0
        })
      } catch (err) {
        console.error('Error resetting unread count:', err)
      }
    }
  }

  // Handle hardware back button (Android/iOS swipe)
  useEffect(() => {
    const handlePopState = () => {
      if (currentChat) {
        setCurrentChat(null)
      }
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [currentChat])

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
    const ts = usersMap[user?.uid]?.themeSettings || {}
    let settings = {}
    if (target === 'chat' && currentChat) {
      settings = ts.perChat?.[currentChat.id] || {}
    } else {
      settings = ts.global || ts
    }
    setModalThemeColor(settings.themeColor || 'light')
    setModalBgImage(settings.bgImage || '')
    setModalBgSize(settings.bgSize || 'cover')
    setModalBgPosition(settings.bgPosition || 'center')
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
      }
      img.src = event.target.result
    }
    reader.readAsDataURL(file)
  }

  const handleSaveTheme = async () => {
    try {
      const userRef = doc(db, 'users', user.uid)
      const currentUserData = usersMap[user.uid] || {}
      const currentThemeSettings = currentUserData.themeSettings || {}

      const newSettings = {
        themeColor: modalThemeColor,
        bgImage: modalBgImage,
        bgSize: modalBgSize,
        bgPosition: modalBgPosition
      }

      let updatedThemeSettings = { ...currentThemeSettings }
      if (themeModalTarget === 'global') {
        updatedThemeSettings.global = newSettings
      } else if (themeModalTarget === 'chat' && currentChat) {
        if (!updatedThemeSettings.perChat) {
          updatedThemeSettings.perChat = {}
        }
        updatedThemeSettings.perChat[currentChat.id] = newSettings
      }

      await updateDoc(userRef, {
        themeSettings: updatedThemeSettings
      })

      setThemeModalTarget(null)
    } catch (err) {
      console.error('Error saving theme:', err)
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

  return (
    <div className={`layout-container ${currentChat ? 'chat-active' : ''}`}>
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <h2 className="server-name">ChatFlow</h2>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <Palette 
              size={18} 
              className="action-icon" 
              onClick={() => openThemeModal('global')} 
              title="Global Theme Settings" 
            />
            <Settings size={18} className="action-icon" />
          </div>
        </div>

        <div className="sidebar-search">
          <div className="search-input-wrapper">
            <Search size={16} />
            <input
              type="text"
              placeholder="Search users..."
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
                  const resultPhoto = usersMap[result.uid]?.photoURL;
                  return (
                    <li key={result.uid} className="search-result-item">
                      <div className="search-result-info">
                        <div className="search-result-avatar">
                          {resultPhoto ? (
                            <img src={resultPhoto} alt="Avatar" className="avatar-img" />
                          ) : (
                            <User size={14} />
                          )}
                        </div>
                        <span className="search-result-email">{result.email} {isSelf && "(You)"}</span>
                      </div>
                      {!isSelf && (
                        sentRequests.has(result.uid) ? (
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
                          <span className="search-result-email" title={usersMap[req.from]?.username || req.fromEmail}>
                            {usersMap[req.from]?.username || req.fromEmail}
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

            {/* Direct Messages / Friends */}
            <div className="channel-section-header" style={{ marginTop: incomingRequests.length > 0 ? '1rem' : '0' }}>
              <span>Friends</span>
            </div>
            <ul className="channel-list">
              {chats.length === 0 && (
                <div className="search-empty" style={{ padding: '0.5rem' }}>No friends yet. Search and add someone!</div>
              )}
              {chats.map(chat => {
                const unreadCount = chat.unreadCount?.[user.uid] || 0;
                const friendPhoto = usersMap[chat.otherUid]?.photoURL;
                return (
                  <li
                    key={chat.id}
                    className={`channel-item ${currentChat?.id === chat.id ? 'active' : ''}`}
                    onClick={() => handleSelectChat(chat)}
                  >
                    <div className="dm-item-content">
                      <div className="dm-item-top">
                        <div className="avatar dm-avatar">
                          {friendPhoto ? <img src={friendPhoto} alt="Avatar" className="avatar-img" /> : <User size={14} />}
                          <div className={`status-indicator ${usersMap[chat.otherUid]?.online ? 'online' : ''}`}></div>
                        </div>
                        <span className="dm-email" title={usersMap[chat.otherUid]?.username || chat.otherEmail}>
                          {usersMap[chat.otherUid]?.username || chat.otherEmail}
                        </span>
                        {unreadCount > 0 && (
                          <div className="unread-badge">
                            {unreadCount}
                          </div>
                        )}
                      </div>
                      {chat.lastMessage && (
                        <div className={`dm-preview ${chat.lastMessageSender !== user.uid && unreadCount > 0 ? 'unread' : ''}`}>
                          {chat.lastMessageSender === user.uid ? 'You: ' : ''}
                          {chat.lastMessage}
                        </div>
                      )}
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
              <span className="user-name">{usersMap[user.uid]?.username || user.email.split('@')[0]}</span>
              <span className="user-status">Online</span>
            </div>
          </div>
          <button className="sign-out-btn" onClick={handleSignOut} title="Sign Out">
            <LogOut size={18} />
          </button>
        </div>
      </aside>

      {/* Main Chat Area */}
      <main className="main-chat">
        {currentChat ? (
          <>
            <header className="chat-header">
              <div className="chat-header-left">
                <button className="mobile-back-btn" onClick={() => setCurrentChat(null)}>
                  <ChevronLeft size={24} />
                </button>
                <div className="chat-header-avatar" onClick={() => setViewProfileUser(usersMap[currentChat.otherUid])} style={{ cursor: 'pointer' }}>
                  {usersMap[currentChat.otherUid]?.photoURL ? (
                    <img src={usersMap[currentChat.otherUid].photoURL} alt="Avatar" className="avatar-img" />
                  ) : (
                    <User size={24} style={{ color: 'var(--color-outline)' }} />
                  )}
                </div>
                <div onClick={() => setViewProfileUser(usersMap[currentChat.otherUid])} style={{ cursor: 'pointer' }}>
                  <h1 className="channel-title">{usersMap[currentChat.otherUid]?.username || currentChat.otherEmail.split('@')[0]}</h1>
                  <p className="channel-topic">
                    {usersMap[currentChat.otherUid]?.online ? (
                      <span style={{ color: 'var(--color-green)', fontWeight: '600' }}>Online</span>
                    ) : (
                      <span style={{ color: 'var(--color-text-muted)' }}>Offline</span>
                    )}
                  </p>
                </div>
              </div>
              <div className="chat-header-right">
                <button className="action-icon" onClick={() => openThemeModal('chat')} title="Chat Theme & Wallpaper" style={{ background: 'transparent', border: 'none' }}>
                  <Palette size={20} />
                </button>
              </div>
            </header>

            <div 
              className="message-stream" 
              ref={messageStreamRef}
              style={{
                backgroundImage: bgImage ? `url(${bgImage})` : 'none',
                backgroundSize: bgSize === 'stretch' ? '100% 100%' : bgSize,
                backgroundPosition: bgPosition,
                backgroundRepeat: bgSize === 'repeat' ? 'repeat' : 'no-repeat',
                backgroundAttachment: bgImage ? 'scroll' : 'scroll',
                backgroundColor: bgImage ? (themeColor === 'light' ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.5)') : 'transparent'
              }}
            >
              <div className="message-stream-inner">
                {messages.length === 0 && (
                  <div className="empty-state">
                    <p>No messages yet. Say hello to {usersMap[currentChat.otherUid]?.username || currentChat.otherEmail.split('@')[0]}!</p>
                  </div>
                )}

                {messages.map((msg, idx) => {
                  const isMe = msg.uid === user.uid
                  const showHeader = idx === 0 || messages[idx - 1].uid !== msg.uid
                  const senderPhoto = usersMap[msg.uid]?.photoURL

                  return (
                    <div key={msg.id} className={`message-wrapper ${isMe ? 'message-mine' : 'message-theirs'} ${showHeader ? 'mt-4' : 'mt-1'}`}>
                      {!isMe && showHeader && (
                        <div
                          className="message-avatar"
                          onClick={() => setViewProfileUser(usersMap[msg.uid])}
                          style={{ cursor: 'pointer' }}
                        >
                          {senderPhoto ? (
                            <img src={senderPhoto} alt="Avatar" className="avatar-img" />
                          ) : (
                            msg.email.charAt(0).toUpperCase()
                          )}
                        </div>
                      )}

                      <div className="message-content">
                        {showHeader && (
                          <div className={`message-header ${isMe ? 'message-header-right' : ''}`}>
                            {!isMe && <span className="message-sender">{usersMap[msg.uid]?.username || msg.email.split('@')[0]}</span>}
                            <span className="message-time">
                              {msg.createdAt?.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) || 'Just now'}
                            </span>
                          </div>
                        )}

                        <div className={`message-bubble ${isMe ? 'bubble-mine' : 'bubble-theirs'}`}>
                          {msg.text}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="chat-input-container">
              <form onSubmit={handleSend} className="chat-input-wrapper">
                <input
                  ref={chatInputRef}
                  type="text"
                  className="chat-input"
                  value={newMessage}
                  onChange={e => setNewMessage(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      handleSend(e)
                    }
                  }}
                  placeholder={`Message ${usersMap[currentChat.otherUid]?.username || currentChat.otherEmail.split('@')[0]}...`}
                />
                <button 
                  type="submit" 
                  className={`send-btn ${newMessage.trim() ? 'active' : ''}`} 
                  style={{ width: 'auto', padding: '0 1rem', gap: '0.5rem' }}
                  onMouseDown={e => e.preventDefault()}
                  onTouchStart={e => e.preventDefault()}
                >
                  <span style={{ fontWeight: '600', fontSize: '0.9rem' }}>Send</span>
                  <Send size={16} />
                </button>
              </form>
            </div>
          </>
        ) : (
          <div className="no-chat-selected">
            <MessageSquare size={48} style={{ color: 'var(--color-border)', marginBottom: '1rem' }} />
            <h2>aja chat kr le</h2>
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

      {/* View Friend Profile Modal */}
      {viewProfileUser && (
        <div className="profile-modal-overlay" onClick={() => setViewProfileUser(null)}>
          <div className="profile-modal" onClick={e => e.stopPropagation()}>
            <div className="profile-modal-header">
              <h3>{viewProfileUser.username || viewProfileUser.email.split('@')[0]}'s Profile</h3>
              <button className="close-modal-btn" onClick={() => setViewProfileUser(null)}>
                <X size={20} />
              </button>
            </div>

            <div className="profile-modal-body" style={{ alignItems: 'center', textAlign: 'center', display: 'flex', flexDirection: 'column' }}>
              <div
                className="profile-photo-preview"
                style={{ marginBottom: '1rem', width: '120px', height: '120px', cursor: viewProfileUser.photoURL ? 'pointer' : 'default' }}
                onClick={() => viewProfileUser.photoURL && setFullScreenPhoto(viewProfileUser.photoURL)}
              >
                {viewProfileUser.photoURL ? (
                  <img src={viewProfileUser.photoURL} alt="Profile" className="avatar-img" />
                ) : (
                  <User size={64} color="var(--color-text-muted)" />
                )}
              </div>
              <h4 style={{ fontSize: '1.2rem', marginBottom: '0.5rem', color: 'var(--color-text-main)' }}>
                {viewProfileUser.username || viewProfileUser.email.split('@')[0]}
              </h4>
              <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem', lineHeight: '1.4' }}>
                {viewProfileUser.bio || "This user hasn't written a bio yet."}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Full Screen Photo Modal */}
      {fullScreenPhoto && (
        <div className="profile-modal-overlay" onClick={() => setFullScreenPhoto(null)} style={{ zIndex: 2000 }}>
          <div style={{ position: 'relative', maxWidth: '90vw', maxHeight: '90vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <button
              className="close-modal-btn"
              style={{ position: 'absolute', top: '-40px', right: '0', color: 'white', background: 'rgba(0,0,0,0.5)', borderRadius: '50%', padding: '4px' }}
              onClick={() => setFullScreenPhoto(null)}
            >
              <X size={24} />
            </button>
            <img
              src={fullScreenPhoto}
              alt="Full Screen"
              style={{ maxWidth: '100%', maxHeight: '90vh', objectFit: 'contain', borderRadius: 'var(--radius-md)', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)' }}
              onClick={e => e.stopPropagation()}
            />
          </div>
        </div>
      )}

      {/* Message Info Modal */}
      {messageReadInfo && (
        <div className="profile-modal-overlay" onClick={() => setMessageReadInfo(null)}>
          <div className="profile-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '300px' }}>
            <div className="profile-modal-header">
              <h3>Message Info</h3>
              <button className="close-modal-btn" onClick={() => setMessageReadInfo(null)}>
                <X size={20} />
              </button>
            </div>
            <div className="profile-modal-body" style={{ textAlign: 'center' }}>
              <p style={{ fontStyle: 'italic', color: 'var(--color-text-muted)', marginBottom: '1rem', wordBreak: 'break-word' }}>"{messageReadInfo.text}"</p>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <CheckCheck size={18} color="#60a5fa" />
                  <span><strong>Read At:</strong> {messageReadInfo.readAt ? messageReadInfo.readAt.toDate().toLocaleString() : (messageReadInfo.status === 'read' ? 'Read' : 'Not read yet')}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--color-text-muted)' }}>
                  <CheckCheck size={18} />
                  <span><strong>Delivered At:</strong> {messageReadInfo.deliveredAt ? messageReadInfo.deliveredAt.toDate().toLocaleString() : (messageReadInfo.status === 'delivered' || messageReadInfo.status === 'read' ? 'Delivered' : 'Not delivered yet')}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Theme Settings Modal */}
      {themeModalTarget && (
        <div className="profile-modal-overlay" onClick={() => setThemeModalTarget(null)}>
          <div className="profile-modal" onClick={e => e.stopPropagation()}>
            <div className="profile-modal-header">
              <h3>{themeModalTarget === 'global' ? 'Global Theme & Wallpaper' : 'Chat Theme & Wallpaper'}</h3>
              <button className="close-modal-btn" onClick={() => setThemeModalTarget(null)}>
                <X size={20} />
              </button>
            </div>
            
            <div className="profile-modal-body">
              <div className="profile-field" style={{ marginBottom: '1.5rem' }}>
                <label>Color Theme</label>
                <select 
                  className="input-base" 
                  value={modalThemeColor}
                  onChange={(e) => setModalThemeColor(e.target.value)}
                >
                  <option value="light">Default Light</option>
                  <option value="dark">Dark Mode</option>
                  <option value="blue">Midnight Blue</option>
                </select>
              </div>

              <div className="profile-field" style={{ marginBottom: '1.5rem' }}>
                <label>Background Wallpaper</label>
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                  <div style={{ width: '80px', height: '120px', borderRadius: '6px', background: 'var(--color-bg-sidebar)', overflow: 'hidden', border: '1px solid var(--color-border)', flexShrink: 0 }}>
                    {modalBgImage ? (
                      <img src={modalBgImage} alt="Wallpaper Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)', fontSize: '0.7rem' }}>None</div>
                    )}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <label className="upload-btn">
                      <Camera size={16} /> Choose Image
                      <input type="file" accept="image/*" onChange={handleThemePhotoUpload} style={{ display: 'none' }} />
                    </label>
                    {modalBgImage && (
                      <button 
                        className="btn" 
                        onClick={() => setModalBgImage('')}
                        style={{ padding: '0.25rem', fontSize: '0.8rem', color: 'var(--color-red)' }}
                      >
                        Remove Image
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {modalBgImage && (
                <>
                  <div className="profile-field">
                    <label>Background Size</label>
                    <select 
                      className="input-base" 
                      value={modalBgSize}
                      onChange={(e) => setModalBgSize(e.target.value)}
                    >
                      <option value="cover">Cover (Fill Screen, Crops Edges)</option>
                      <option value="contain">Contain (Fit Image, Adds Bars)</option>
                      <option value="stretch">Stretch (Distorts Image)</option>
                      <option value="repeat">Tile / Repeat</option>
                    </select>
                  </div>
                  
                  <div className="profile-field">
                    <label>Image Position (Adjust Crop)</label>
                    <select 
                      className="input-base" 
                      value={modalBgPosition}
                      onChange={(e) => setModalBgPosition(e.target.value)}
                    >
                      <option value="center">Center</option>
                      <option value="top">Top</option>
                      <option value="bottom">Bottom</option>
                      <option value="left">Left</option>
                      <option value="right">Right</option>
                    </select>
                  </div>
                </>
              )}
            </div>

            <div className="profile-modal-footer">
              <button className="btn" onClick={() => setThemeModalTarget(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSaveTheme}>Save Theme</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
