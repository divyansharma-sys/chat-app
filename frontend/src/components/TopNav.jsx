import React from 'react'
import { Phone, Video, Search, MoreVertical } from 'lucide-react'

export default function TopNav() {
  return (
    <nav className="top-nav">
      <div className="nav-left">
        <div className="logo-container">
          <div className="logo-icon">∞</div>
          <span>ChatFlow</span>
        </div>
        <div className="nav-tabs">
          <div className="nav-tab active">Direct Messages</div>
          <div className="nav-tab">Channels</div>
          <div className="nav-tab">Mentions</div>
          <div className="nav-tab">Threads</div>
        </div>
      </div>
      <div className="nav-right">
        <button className="icon-btn"><Phone size={20} /></button>
        <button className="icon-btn"><Video size={20} /></button>
        <button className="icon-btn"><Search size={20} /></button>
        <button className="icon-btn" style={{ marginLeft: '1rem' }}><MoreVertical size={20} /></button>
        <img src="https://i.pravatar.cc/150?u=a042581f4e29026704d" alt="Profile" className="nav-profile" />
      </div>
    </nav>
  )
}
