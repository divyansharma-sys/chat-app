import React from 'react'
import { Phone, Video, Search, LayoutPanelLeft, Paperclip, Image as ImageIcon, Smile, Code, Bold, Mic, Send, Star, Download, Check } from 'lucide-react'

export default function ChatArea() {
  return (
    <main className="chat-area">
      {/* Header */}
      <header className="chat-header">
        <div className="chat-header-user">
          <div style={{ position: 'relative' }}>
            <img src="https://i.pravatar.cc/150?img=5" alt="Sarah Jenkins" className="header-avatar" />
            <div className="status-dot status-online" style={{ position: 'absolute', bottom: 2, right: 2 }}></div>
          </div>
          <div className="header-info">
            <h2>Sarah Jenkins <Star size={16} fill="#f59e0b" color="#f59e0b" style={{ marginLeft: 4 }} /></h2>
            <div className="header-role">
              Senior Product Designer <span style={{ color: 'var(--color-green)' }}>• Active now</span>
            </div>
          </div>
        </div>
        <div className="chat-header-actions">
          <button className="icon-btn"><Phone size={18} /></button>
          <button className="icon-btn"><Video size={18} /></button>
          <button className="icon-btn"><Search size={18} /></button>
          <button className="icon-btn"><LayoutPanelLeft size={18} /></button>
        </div>
      </header>

      {/* Messages */}
      <div className="messages-container">
        <div className="date-divider">Today, October 24</div>

        {/* Message 1 (Sarah) */}
        <div className="message-group">
          <img src="https://i.pravatar.cc/150?img=5" alt="Sarah" className="msg-avatar" />
          <div className="msg-content">
            <div className="msg-header">
              <span className="msg-name">Sarah Jenkins</span>
              <span className="msg-time">11:32 AM</span>
            </div>
            <div className="msg-bubble">
              Hey Alex! Just pushed the updated token system for the ChatFlow desktop redesign. Take a look when you have a second.
            </div>
          </div>
        </div>

        {/* Message 2 (Me) */}
        <div className="message-group" style={{ alignSelf: 'flex-end', maxWidth: '80%' }}>
          <div className="msg-content">
            <div className="msg-header" style={{ justifyContent: 'flex-end' }}>
              <span className="msg-time">11:35 AM</span>
              <span className="msg-name me">Alex Morgan (You)</span>
            </div>
            <div className="msg-bubble mine">
              Awesome, looking at it right now! The color hierarchy and subtle shadows look super clean.
            </div>
            <div style={{ fontSize: '0.7rem', color: 'var(--color-primary)', textAlign: 'right', marginTop: '0.25rem', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.25rem' }}>
              Read <Check size={12} />
            </div>
          </div>
        </div>

        {/* Message 3 (Sarah with Attachment) */}
        <div className="message-group">
          <img src="https://i.pravatar.cc/150?img=5" alt="Sarah" className="msg-avatar" />
          <div className="msg-content">
            <div className="msg-header">
              <span className="msg-name">Sarah Jenkins</span>
              <span className="msg-time">11:37 AM</span>
            </div>
            <div className="msg-bubble" style={{ maxWidth: '400px' }}>
              Here is the Figma archive with the complete auto-layout component library and color system tokens:
              
              <div className="msg-attachment">
                <div className="figma-preview">
                  <div className="figma-logo">
                    <span style={{ fontSize: '1.5rem' }}>❖</span> Figma Tokens v2.0
                  </div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginTop: '0.5rem' }}>Desktop 3-Column Spec</span>
                </div>
                <div className="attachment-footer">
                  <div className="attachment-info" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <div style={{ width: 32, height: 32, backgroundColor: '#e0e7ff', color: 'var(--color-primary)', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Video size={16} />
                    </div>
                    <div>
                      <h4>chatflow-design-system-v2.fig</h4>
                      <p>14.2 MB • Ready for dev</p>
                    </div>
                  </div>
                  <button className="download-btn">
                    <Download size={14} /> Download
                  </button>
                </div>
              </div>
              
              <div className="msg-reactions">
                <div className="reaction-pill active">🚀 3</div>
                <div className="reaction-pill">🙌 2</div>
                <div className="reaction-pill"><Smile size={14} style={{ color: 'var(--color-text-muted)' }} /></div>
              </div>
            </div>
          </div>
        </div>
        
      </div>

      {/* Input Box */}
      <div className="chat-input-area">
        <div className="input-wrapper">
          <input 
            type="text" 
            className="input-field" 
            placeholder="Type a message to Sarah... (Shift+Enter for new line)"
          />
          <div className="input-toolbar">
            <div className="toolbar-actions">
              <button className="icon-btn"><Paperclip size={18} /></button>
              <button className="icon-btn"><ImageIcon size={18} /></button>
              <button className="icon-btn"><Smile size={18} /></button>
              <div style={{ width: 1, height: 16, backgroundColor: 'var(--color-border)', margin: '0 0.5rem' }}></div>
              <button className="icon-btn"><Code size={18} /></button>
              <button className="icon-btn"><Bold size={18} /></button>
            </div>
            <div className="toolbar-actions" style={{ gap: '1rem' }}>
              <button className="icon-btn"><Mic size={18} /></button>
              <button className="send-button"><Send size={16} /></button>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
