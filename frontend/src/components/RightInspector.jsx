import React from 'react'
import { X, BellOff, Star, Search, Download, ExternalLink, Lock, Ban, Flag, FileText, Table } from 'lucide-react'

export default function RightInspector() {
  return (
    <aside className="right-inspector">
      <div className="inspector-header">
        Contact Info
        <button className="icon-btn"><X size={18} /></button>
      </div>

      <div className="inspector-profile">
        <div style={{ position: 'relative' }}>
          <img src="https://i.pravatar.cc/150?img=5" alt="Sarah Jenkins" className="inspector-avatar" />
          <div className="status-dot status-online" style={{ width: 16, height: 16, borderWidth: 3, position: 'absolute', bottom: 18, right: 6 }}></div>
        </div>
        <h2 className="inspector-name">Sarah Jenkins</h2>
        <p className="inspector-role">Senior Product Designer</p>
        <p className="inspector-email">sarah.jenkins@chatflow.io</p>
        
        <div className="inspector-time">
          🕒 11:42 AM Local time • San Francisco
        </div>
      </div>

      <div className="inspector-actions">
        <button className="action-btn">
          <BellOff size={18} />
          Mute
        </button>
        <button className="action-btn star">
          <Star size={18} fill="#f59e0b" />
          Starred
        </button>
        <button className="action-btn">
          <Search size={18} />
          Search
        </button>
      </div>

      <div className="inspector-section">
        <div className="section-header">
          <div className="section-title">Shared Media <span>(28)</span></div>
          <div className="view-all">View All</div>
        </div>
        <div className="media-grid">
          <img src="https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&q=80&w=150&h=150" alt="media" className="media-item" />
          <img src="https://images.unsplash.com/photo-1542744173-8e7e53415bb0?auto=format&fit=crop&q=80&w=150&h=150" alt="media" className="media-item" />
          <img src="https://images.unsplash.com/photo-1512486130939-2c4f79935e4f?auto=format&fit=crop&q=80&w=150&h=150" alt="media" className="media-item" />
        </div>
      </div>

      <div className="inspector-section">
        <div className="section-header">
          <div className="section-title">Shared Files <span>(12)</span></div>
          <div className="view-all">View All</div>
        </div>
        <div className="file-list">
          <div className="file-item">
            <div className="file-icon"><FileText size={16} /></div>
            <div className="file-info">
              <div className="file-name">desktop-tokens-v2.pdf</div>
              <div className="file-meta">3.4 MB • Oct 22</div>
            </div>
            <button className="icon-btn"><Download size={16} /></button>
          </div>
          <div className="file-item">
            <div className="file-icon green"><Table size={16} /></div>
            <div className="file-info">
              <div className="file-name">user-research-metrics.csv</div>
              <div className="file-meta">840 KB • Oct 19</div>
            </div>
            <button className="icon-btn"><Download size={16} /></button>
          </div>
        </div>
      </div>

      <div className="inspector-section">
        <div className="section-header">
          <div className="section-title">Shared Links <span>(5)</span></div>
        </div>
        <div className="link-list">
          <div className="file-item">
            <div className="file-icon purple"><ExternalLink size={16} /></div>
            <div className="file-info">
              <div className="file-name">figma.com/@chatflow/tokens</div>
              <div className="file-meta">Figma workspace direct link</div>
            </div>
            <button className="icon-btn"><ExternalLink size={16} /></button>
          </div>
        </div>
      </div>

      <div className="e2e-badge">
        <Lock size={18} color="var(--color-green)" style={{ marginTop: 2 }} />
        <div className="e2e-info">
          <h4>End-to-end encrypted</h4>
          <p>Messages and calls are secured</p>
        </div>
      </div>

      <div className="inspector-danger">
        <div className="danger-action">
          <Ban size={16} /> Block Sarah Jenkins
        </div>
        <div className="danger-action gray">
          <Flag size={16} /> Report conversation
        </div>
      </div>

    </aside>
  )
}
