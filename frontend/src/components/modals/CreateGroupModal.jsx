import React, { useState } from 'react'
import { X, Users, Search, Check, Lock, Globe, Mail, Plus } from 'lucide-react'
import { db } from '../../firebase'
import { collection, addDoc, serverTimestamp } from 'firebase/firestore'
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
  const [visibility, setVisibility] = useState('private')

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

  const removeSelectedUser = (uid) => {
    setSelectedUserIds((prev) => {
      const next = new Set(prev)
      next.delete(uid)
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

  const selectedUsersList = Array.from(selectedUserIds).map(id => usersList.find(u => u.uid === id)).filter(Boolean)

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
        visibility: visibility,
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
    <div className="new-modal-overlay">
      <div className="new-modal-container">
        <div className="new-modal-glow-top"></div>
        
        <div className="new-modal-header">
          <div className="header-left">
            <div className="header-icon-box">
              <Users size={18} />
            </div>
            <div className="header-titles">
              <h3>Create New Group <span className="badge-workspace">WORKSPACE</span></h3>
              <p>Start a collaborative discussion with multiple team members</p>
            </div>
          </div>
          <button type="button" className="new-close-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {error && <div className="new-error-banner">{error}</div>}

        <form onSubmit={handleCreate} className="new-modal-form">
          <div className="new-form-scroll">
            
            {/* GROUP NAME */}
            <div className="new-field-group">
              <div className="new-field-labels">
                <label>GROUP NAME *</label>
                <span className="new-char-count">Max 50 characters</span>
              </div>
              <div className="new-input-wrapper">
                <span className="input-prefix">#</span>
                <input
                  type="text"
                  placeholder="Apollo Design Core"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  maxLength={50}
                  required
                />
              </div>
            </div>

            {/* DESCRIPTION */}
            <div className="new-field-group">
              <div className="new-field-labels">
                <label>DESCRIPTION <span className="label-optional">(optional)</span></label>
                <span className="new-char-count">Helps members understand the goal</span>
              </div>
              <div className="new-input-wrapper">
                <input
                  type="text"
                  placeholder="What is this group about? Share primary goals or topics..."
                  value={groupDescription}
                  onChange={(e) => setGroupDescription(e.target.value)}
                  maxLength={100}
                />
              </div>
            </div>

            {/* VISIBILITY */}
            <div className="new-field-group">
              <div className="new-field-labels">
                <label>VISIBILITY</label>
              </div>
              <div className="visibility-grid">
                <div 
                  className={`vis-card ${visibility === 'private' ? 'active' : ''}`}
                  onClick={() => setVisibility('private')}
                >
                  <div className="vis-radio">
                    {visibility === 'private' && <div className="vis-radio-inner" />}
                  </div>
                  <Lock size={16} className="vis-icon" />
                  <div className="vis-text">
                    <h4>Private Group</h4>
                    <p>Invite-only channel access</p>
                  </div>
                </div>
                
                <div 
                  className={`vis-card ${visibility === 'open' ? 'active' : ''}`}
                  onClick={() => setVisibility('open')}
                >
                  <div className="vis-radio">
                    {visibility === 'open' && <div className="vis-radio-inner" />}
                  </div>
                  <Globe size={16} className="vis-icon" />
                  <div className="vis-text">
                    <h4>Open Workspace</h4>
                    <p>Anyone in organization can join</p>
                  </div>
                </div>
              </div>
            </div>

            {/* SELECT MEMBERS */}
            <div className="new-field-group">
              <div className="new-members-header">
                <div className="members-title">
                  <label>Select Members</label>
                  {selectedUserIds.size > 0 && <span className="selected-badge">{selectedUserIds.size} selected</span>}
                </div>
                <div className="new-search-box">
                  <Search size={14} />
                  <input
                    type="text"
                    placeholder="Search by name or @handle..."
                    value={searchMember}
                    onChange={(e) => setSearchMember(e.target.value)}
                  />
                </div>
              </div>

              {/* Selected Chips */}
              {selectedUsersList.length > 0 && (
                <div className="selected-chips-area">
                  {selectedUsersList.slice(0, 5).map(u => (
                    <div className="member-chip" key={`chip-${u.uid}`}>
                      <div className="chip-avatar">
                        {u.photoURL ? (
                          <img src={u.photoURL} alt="avatar" />
                        ) : (
                          (u.username || u.email || 'U')[0].toUpperCase()
                        )}
                      </div>
                      <span className="chip-name">{u.username || u.email?.split('@')[0]}</span>
                      <button type="button" className="chip-remove" onClick={() => removeSelectedUser(u.uid)}>
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                  {selectedUsersList.length > 5 && (
                    <div className="chip-more">+{selectedUsersList.length - 5} more from list below</div>
                  )}
                </div>
              )}

              <div className="new-members-list">
                {filteredUsers.length === 0 ? (
                  <div className="empty-state">No users found</div>
                ) : (
                  filteredUsers.map((u) => {
                    const isSelected = selectedUserIds.has(u.uid)
                    return (
                      <div
                        key={u.uid}
                        className={`new-member-row ${isSelected ? 'selected' : ''}`}
                        onClick={() => toggleSelectUser(u.uid)}
                      >
                        <div className="new-member-left">
                          <div className="new-member-avatar-box">
                            {u.photoURL ? (
                              <img src={u.photoURL} alt="Avatar" />
                            ) : (
                              <div className="new-avatar-placeholder">
                                {(u.username || u.email || 'U')[0].toUpperCase()}
                              </div>
                            )}
                            {u.isOnline && <div className="online-dot"></div>}
                          </div>
                          
                          <div className="new-member-info">
                            <div className="name-row">
                              <span className="name">{u.username || u.email?.split('@')[0]}</span>
                              <span className="real-name">{u.displayName || u.email?.split('@')[0]}</span>
                            </div>
                            <div className="handle-row">
                              <span className="handle">@{u.username || u.email?.split('@')[0]}</span>
                              {/* Mocking a role for aesthetic match */}
                              <span className="role-badge">Member</span>
                            </div>
                          </div>
                        </div>

                        <div className={`new-checkbox ${isSelected ? 'checked' : ''}`}>
                          {isSelected && <Check size={14} strokeWidth={3} />}
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>

          </div>

          <div className="new-modal-footer">
            <div className="footer-left-note">
              <Mail size={14} />
              <span>Members will receive an invite notification</span>
            </div>
            <div className="footer-actions">
              <button type="button" className="btn-cancel-new" onClick={onClose} disabled={isSubmitting}>
                Cancel
              </button>
              <button
                type="submit"
                className="btn-create-new"
                disabled={isSubmitting || !groupName.trim() || selectedUserIds.size === 0}
              >
                <Plus size={16} />
                {isSubmitting ? 'Creating...' : `Create Group (${selectedUserIds.size + 1} members)`}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
