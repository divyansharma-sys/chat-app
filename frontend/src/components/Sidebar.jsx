import React from 'react'
import { Edit, Search, Check, Image as ImageIcon, Hash } from 'lucide-react'

export default function Sidebar() {
  return (
    <aside className="left-sidebar">
      <div className="sidebar-header">
        <div className="profile-card">
          <div className="profile-avatar">
            <img src="https://i.pravatar.cc/150?img=47" alt="Alex Morgan" className="profile-img" />
            <div className="status-dot status-online"></div>
          </div>
          <div className="profile-info">
            <div className="profile-name">
              Alex Morgan
              <span className="pro-badge">PRO</span>
            </div>
            <div className="profile-status-text">
              <div className="status-dot status-online" style={{ position: 'relative', width: 8, height: 8, border: 'none' }}></div>
              Available
            </div>
          </div>
        </div>
        <div className="edit-btn">
          <Edit size={16} />
        </div>
      </div>

      <div className="search-container">
        <div className="search-input-wrapper">
          <Search size={16} />
          <input type="text" placeholder="Search chats, channels, files" />
          <span className="shortcut-hint">(⌘K)</span>
        </div>
      </div>

      <div className="filter-tabs">
        <div className="filter-tab active">All Chats</div>
        <div className="filter-tab">Unread <span className="unread-count" style={{ marginLeft: 4 }}>3</span></div>
        <div className="filter-tab">Channels</div>
        <div className="filter-tab">Direct</div>
      </div>

      <div className="chat-list">
        {/* Active Chat */}
        <div className="chat-list-item active">
          <img src="https://i.pravatar.cc/150?img=5" alt="Sarah Jenkins" className="chat-list-avatar" />
          <div className="chat-list-content">
            <div className="chat-list-header">
              <span className="chat-list-name active">Sarah Jenkins</span>
              <span className="chat-list-time">11:42 AM</span>
            </div>
            <div className="chat-list-preview">
              <span style={{ color: 'var(--color-primary)' }}>Can you review the latest Figma compon...</span>
              <Check size={14} style={{ color: 'var(--color-primary)' }} />
            </div>
          </div>
        </div>

        {/* Group Chat */}
        <div className="chat-list-item">
          <div className="chat-list-avatar" style={{ position: 'relative' }}>
            <img src="https://i.pravatar.cc/150?img=11" alt="Group 1" style={{ width: 28, height: 28, borderRadius: '50%', position: 'absolute', top: 0, left: 0 }} />
            <img src="https://i.pravatar.cc/150?img=12" alt="Group 2" style={{ width: 28, height: 28, borderRadius: '50%', position: 'absolute', bottom: 0, right: 0 }} />
          </div>
          <div className="chat-list-content">
            <div className="chat-list-header">
              <span className="chat-list-name">Product Launch 2025 👥</span>
              <span className="chat-list-time">11:30 AM</span>
            </div>
            <div className="chat-list-preview">
              <span><strong>David:</strong> Deployment is scheduled for 4 P...</span>
              <span className="unread-count">4</span>
            </div>
          </div>
        </div>

        {/* Individual */}
        <div className="chat-list-item">
          <img src="https://i.pravatar.cc/150?img=33" alt="Marcus Chen" className="chat-list-avatar" />
          <div className="chat-list-content">
            <div className="chat-list-header">
              <span className="chat-list-name">Marcus Chen</span>
              <span className="chat-list-time">10:15 AM</span>
            </div>
            <div className="chat-list-preview">
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}><ImageIcon size={12} /> Sent an image: dashboard-wireframe.png</span>
            </div>
          </div>
        </div>

        {/* Individual */}
        <div className="chat-list-item">
          <img src="https://i.pravatar.cc/150?img=41" alt="Elena Rostova" className="chat-list-avatar" />
          <div className="chat-list-content">
            <div className="chat-list-header">
              <span className="chat-list-name">Elena Rostova</span>
              <span className="chat-list-time">Yesterday</span>
            </div>
            <div className="chat-list-preview">
              <span>Thanks for the quick turnaround! 🙌</span>
              <Check size={14} color="#10b981" />
            </div>
          </div>
        </div>

        {/* Channel */}
        <div className="chat-list-item">
          <div className="channel-avatar"><Hash size={24} /></div>
          <div className="chat-list-content">
            <div className="chat-list-header">
              <span className="chat-list-name">Dev Infrastructure</span>
              <span className="chat-list-time">Yesterday</span>
            </div>
            <div className="chat-list-preview">
              <span><strong style={{ color: 'var(--color-green)' }}>#dev-infra:</strong> API latency down 24%</span>
            </div>
          </div>
        </div>
      </div>

      <div className="sidebar-footer">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--color-primary)' }}>
          <div style={{ width: 24, height: 24, borderRadius: 6, backgroundColor: 'var(--color-primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>A</div>
          Acme Dev Team
        </div>
        <div className="footer-online">
          <div className="status-dot status-online" style={{ position: 'relative', width: 8, height: 8, border: 'none' }}></div>
          68 online
        </div>
      </div>
    </aside>
  )
}
