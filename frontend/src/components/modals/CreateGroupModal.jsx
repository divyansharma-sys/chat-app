import React, { useState } from 'react'
import { X, Users, Search, Check, Camera } from 'lucide-react'
import { db } from '../../firebase'
import { collection, addDoc, serverTimestamp, setDoc, doc } from 'firebase/firestore'
import { generateGroupKey } from '../../crypto/e2ee'

export default function CreateGroupModal({
  currentUser,
  usersList = [], // List of users/contacts available
  onClose,
  onGroupCreated
}) {
  const [groupName, setGroupName] = useState('')
  const [groupDescription, setGroupDescription] = useState('')
  const [searchMember, setSearchMember] = useState('')
  const [selectedUserIds, setSelectedUserIds] = useState(new Set())
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')

  const toggleSelectUser = (uid) => {
    setSelectedUserIds((prev) => {
      const next = new Set(prev)
      if (next.has(uid)) {
        next.delete(uid)
      } else {
        next.add(uid)
      }
      return next
    })
  }

  const filteredUsers = usersList.filter((u) => {
    if (u.uid === currentUser.uid) return false
    const term = searchMember.toLowerCase().trim().replace(/^@/, '')
    if (!term) return true
    const username = (u.username || u.email?.split('@')[0] || '').toLowerCase()
    return username.includes(term)
  })

  const handleCreate = async (e) => {
    e.preventDefault()
    if (!groupName.trim()) {
      setError('Please provide a group name')
      return
    }
    if (selectedUserIds.size === 0) {
      setError('Please select at least 1 member')
      return
    }

    setIsSubmitting(true)
    setError('')

    try {
      const participantIds = [currentUser.uid, ...Array.from(selectedUserIds)]

      // Generate E2EE Group symmetric key
      const groupKeyJwk = await generateGroupKey()

      // Initial unread count map
      const unreadMap = {}
      participantIds.forEach((id) => {
        unreadMap[id] = 0
      })

      // Create group in chats collection
      const groupDocRef = await addDoc(collection(db, 'chats'), {
        type: 'group',
        name: groupName.trim(),
        description: groupDescription.trim() || '',
        photoURL: null,
        createdBy: currentUser.uid,
        adminUids: [currentUser.uid],
        participants: participantIds,
        unreadCount: unreadMap,
        lastMessage: `${currentUser.email?.split('@')[0]} created the group`,
        lastMessageSender: currentUser.uid,
        lastMessageStatus: 'read',
        e2eeKeyJwk: groupKeyJwk, // Group encryption key
        permissions: {
          whoCanMessage: 'all',
          whoCanCall: 'all'
        },
        createdAt: serverTimestamp()
      })

      // Add initial announcement message
      await addDoc(collection(db, 'messages'), {
        chatId: groupDocRef.id,
        uid: currentUser.uid,
        email: currentUser.email,
        text: `🎉 Created the group "${groupName.trim()}"`,
        isSystem: true,
        createdAt: serverTimestamp(),
        status: 'read'
      })

      if (onGroupCreated) {
        onGroupCreated({
          id: groupDocRef.id,
          type: 'group',
          name: groupName.trim(),
          participants: participantIds
        })
      }
      onClose()
    } catch (err) {
      console.error('Error creating group:', err)
      setError(err.message || 'Failed to create group')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-content group-modal">
        <div className="modal-header">
          <div className="modal-title-with-icon">
            <Users size={22} className="modal-icon-badge" />
            <div>
              <h3>Create New Group</h3>
              <p>Start a discussion with multiple team members</p>
            </div>
          </div>
          <button type="button" className="btn-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {error && <div className="modal-error-banner">{error}</div>}

        <form onSubmit={handleCreate} className="group-form">
          <div className="form-group">
            <label>Group Name *</label>
            <input
              type="text"
              placeholder="e.g. Design Team, Project Apollo"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              className="input-base"
              maxLength={40}
              required
            />
          </div>

          <div className="form-group">
            <label>Description (optional)</label>
            <input
              type="text"
              placeholder="What is this group about?"
              value={groupDescription}
              onChange={(e) => setGroupDescription(e.target.value)}
              className="input-base"
              maxLength={100}
            />
          </div>

          <div className="form-group">
            <div className="form-group-header">
              <label>Select Members ({selectedUserIds.size} selected)</label>
              <div className="member-search-wrap">
                <Search size={14} />
                <input
                  type="text"
                  placeholder="Filter by username..."
                  value={searchMember}
                  onChange={(e) => setSearchMember(e.target.value)}
                  className="member-search-input"
                />
              </div>
            </div>

            <div className="group-members-picker">
              {filteredUsers.length === 0 ? (
                <div className="picker-empty">No users found</div>
              ) : (
                filteredUsers.map((u) => {
                  const isSelected = selectedUserIds.has(u.uid)
                  return (
                    <div
                      key={u.uid}
                      className={`member-picker-item ${isSelected ? 'selected' : ''}`}
                      onClick={() => toggleSelectUser(u.uid)}
                    >
                      <div className="member-item-left">
                        {u.photoURL ? (
                          <img src={u.photoURL} alt={u.username || 'Avatar'} className="member-picker-avatar" />
                        ) : (
                          <div className="member-picker-avatar-fallback">
                            {(u.username || u.email || 'U')[0].toUpperCase()}
                          </div>
                        )}
                        <div className="member-item-info">
                          <span className="member-name">{u.username || u.email?.split('@')[0]}</span>
                          <span className="member-email">@{u.username || u.email?.split('@')[0] || 'member'}</span>
                        </div>
                      </div>

                      <div className={`checkbox-custom ${isSelected ? 'checked' : ''}`}>
                        {isSelected && <Check size={14} />}
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>

          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isSubmitting || !groupName.trim() || selectedUserIds.size === 0}
            >
              {isSubmitting ? 'Creating...' : `Create Group (${selectedUserIds.size + 1})`}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
