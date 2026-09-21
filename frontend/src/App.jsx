import { useState, useEffect } from 'react'
import { auth } from './firebase'
import { onAuthStateChanged } from 'firebase/auth'
import AuthScreen from './components/AuthScreen'
import ChatLayout from './components/ChatLayout'
import './index.css'

function App() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user)
      setLoading(false)
    })
    return () => unsubscribe()
  }, [])

  if (loading) {
    return (
      <div style={{ height: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: 'var(--color-primary)' }}>Loading...</div>
      </div>
    )
  }

  return user ? <ChatLayout user={user} /> : <AuthScreen />
}

export default App
