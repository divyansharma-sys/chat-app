import React from 'react'
import { X, Users, Shield, LogOut, UserMinus, UserCheck, Crown, Video } from 'lucide-react'
import { db } from '../../firebase'
import { doc, updateDoc, arrayRemove, deleteDoc } from 'firebase/firestore'

export default function GroupInfoModal({
  currentGroup,
  currentUser,
  usersMap = {},
  showToast,
  onClose,
  onStartVideoCall,
  onLeftGroup
}) {
  if (!currentGroup) return null

  const participants = currentGroup.participants || []
  const isAdmin = currentGroup.adminUids?.includes(currentUser.uid)

  const handleLeaveGroup = async () => {
    if (!window.confirm('Are you sure you want to leave this group?')) return
    try {
      await updateDoc(doc(db, 'chats', currentGroup.id), {
        participants: arrayRemove(currentUser.uid)
      })
      onClose()
      if (onLeftGroup) onLeftGroup(currentGroup.id)
    } catch (err) {
      console.error('Error leaving group:', err)
      if (showToast) {
        showToast('Failed to leave group.', 'error')
      }
    }
  }

  const handleDeleteGroup = async () => {
    if (!window.confirm('Are you absolutely sure you want to DELETE this group? This action cannot be undone.')) return
    try {
      await deleteDoc(doc(db, 'chats', currentGroup.id))
      onClose()
      if (onLeftGroup) onLeftGroup(currentGroup.id) // reusing onLeftGroup to clear the active chat UI
      if (showToast) {
        showToast('Group deleted successfully.', 'success')
      }
    } catch (err) {
      console.error('Error deleting group:', err)
      if (showToast) {
        showToast('Failed to delete group.', 'error')
      }
    }
  }

  const handleRemoveMember = async (targetUid) => {
    if (!window.confirm('Remove this member from the group?')) return
    try {
      await updateDoc(doc(db, 'chats', currentGroup.id), {
        participants: arrayRemove(targetUid)
      })
    } catch (err) {
      console.error('Error removing member:', err)
    }
  }

  const permissions = currentGroup.permissions || { whoCanMessage: 'all', whoCanCall: 'all' }
  const canStartCall = !permissions.whoCanCall || permissions.whoCanCall === 'all' || isAdmin

  const handleUpdatePermission = async (key, value) => {
    try {
      await updateDoc(doc(db, 'chats', currentGroup.id), {
        [`permissions.${key}`]: value
      })
    } catch (err) {
      console.error('Error updating group permissions:', err)
      if (showToast) {
        showToast('Failed to update group permissions.', 'error')
      }
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-content group-info-modal">
        <div className="modal-header">
          <div className="modal-title-with-icon">
            <Users size={22} className="modal-icon-badge" />
            <div>
              <h3>{currentGroup.name || 'Group Info'}</h3>
              <p>{participants.length} members</p>
            </div>
          </div>
          <button type="button" className="btn-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {currentGroup.description && (
          <div className="group-info-desc">
            <p>{currentGroup.description}</p>
          </div>
        )}

        {/* Group Permissions Section */}
        <div className="group-permissions-card">
          <div className="permissions-card-header">
            <Shield size={16} className="perm-shield-icon" />
            <h4>Group Permissions</h4>
            {isAdmin ? (
              <span className="perm-admin-tag">Admin Controls</span>
            ) : (
              <span className="perm-readonly-tag">Managed by Admins</span>
            )}
          </div>

          <div className="permission-item">
            <div className="permission-info">
              <span className="permission-title">Send Messages</span>
              <span className="permission-sub">Choose who can send messages in this group</span>
            </div>
            {isAdmin ? (
              <div className="permission-toggle-group">
                <button
                  type="button"
                  className={`perm-btn ${(permissions.whoCanMessage || 'all') === 'all' ? 'active' : ''}`}
                  onClick={() => handleUpdatePermission('whoCanMessage', 'all')}
                >
                  All Members
                </button>
                <button
                  type="button"
                  className={`perm-btn ${permissions.whoCanMessage === 'admins' ? 'active' : ''}`}
                  onClick={() => handleUpdatePermission('whoCanMessage', 'admins')}
                >
                  Only Admins
                </button>
              </div>
            ) : (
              <span className="perm-status-badge">
                {permissions.whoCanMessage === 'admins' ? '🔒 Only Admins' : '👥 All Members'}
              </span>
            )}
          </div>

          <div className="permission-item">
            <div className="permission-info">
              <span className="permission-title">Make Voice / Video Calls</span>
              <span className="permission-sub">Choose who can start calls in this group</span>
            </div>
            {isAdmin ? (
              <div className="permission-toggle-group">
                <button
                  type="button"
                  className={`perm-btn ${(permissions.whoCanCall || 'all') === 'all' ? 'active' : ''}`}
                  onClick={() => handleUpdatePermission('whoCanCall', 'all')}
                >
                  All Members
                </button>
                <button
                  type="button"
                  className={`perm-btn ${permissions.whoCanCall === 'admins' ? 'active' : ''}`}
                  onClick={() => handleUpdatePermission('whoCanCall', 'admins')}
                >
                  Only Admins
                </button>
              </div>
            ) : (
              <span className="perm-status-badge">
                {permissions.whoCanCall === 'admins' ? '🔒 Only Admins' : '👥 All Members'}
              </span>
            )}
          </div>
        </div>

        {onStartVideoCall && canStartCall && (
          <div style={{ padding: '0 1.25rem 0.75rem 1.25rem' }}>
            <button
              type="button"
              onClick={onStartVideoCall}
              style={{
                width: '100%',
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                padding: '10px 16px',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '0.88rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                boxShadow: '0 4px 12px rgba(16, 185, 129, 0.25)',
                transition: 'all 0.2s'
              }}
            >
              <Video size={18} />
              <span>Start Group Video Call</span>
            </button>
          </div>
        )}

        <div className="group-members-list-section">
          <h4>Group Members ({participants.length})</h4>
          <div className="group-members-scroll">
            {participants.map((uid) => {
              const u = usersMap[uid] || { uid, email: 'User' }
              const isUserAdmin = currentGroup.adminUids?.includes(uid)
              const isMe = uid === currentUser.uid

              return (
                <div key={uid} className="group-member-row">
                  <div className="group-member-left">
                    {u.photoURL ? (
                      <img src={u.photoURL} alt={u.email} className="group-member-avatar" />
                    ) : (
                      <div className="group-member-avatar-fallback">
                        {(u.username || u.email || 'U')[0].toUpperCase()}
                      </div>
                    )}
                    <div className="group-member-details">
                      <span className="group-member-name">
                        {u.username || u.email?.split('@')[0] || 'Member'} {isMe && '(You)'}
                      </span>
                      <span className="group-member-email">@{u.username || u.email?.split('@')[0] || 'member'}</span>
                    </div>
                  </div>

                  <div className="group-member-right">
                    {isUserAdmin && (
                      <span className="admin-badge">
                        <Crown size={12} /> Admin
                      </span>
                    )}

                    {isAdmin && !isMe && (
                      <button
                        type="button"
                        className="btn-remove-member"
                        onClick={() => handleRemoveMember(uid)}
                        title="Remove member"
                      >
                        <UserMinus size={16} />
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="modal-actions group-info-actions" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button type="button" className="btn-leave-group" onClick={handleLeaveGroup}>
            <LogOut size={16} /> Leave Group
          </button>
          
          {isAdmin && (
            <button 
              type="button" 
              className="btn-leave-group" 
              onClick={handleDeleteGroup}
              style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.3)' }}
            >
              <X size={16} /> Delete Group
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
