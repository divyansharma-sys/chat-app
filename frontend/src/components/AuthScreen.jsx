import { useState } from 'react'
import { auth, db } from '../firebase'
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth'
import { doc, setDoc, serverTimestamp } from 'firebase/firestore'

export default function AuthScreen({ setUser }) {
  const [isLogin, setIsLogin] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    try {
      if (isLogin) {
        await signInWithEmailAndPassword(auth, email, password)
      } else {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password)
        // Save the new user to the Firestore users collection so they are searchable
        await setDoc(doc(db, 'users', userCredential.user.uid), {
          uid: userCredential.user.uid,
          email: userCredential.user.email,
          createdAt: serverTimestamp()
        })
      }
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100dvh',
      backgroundColor: 'var(--color-bg-sidebar)'
    }}>
      <div className="auth-card" style={{
        padding: '2.5rem',
        borderRadius: 'var(--radius-lg)',
        width: '100%',
        maxWidth: '420px',
        display: 'flex',
        flexDirection: 'column',
        gap: '1.5rem'
      }}>
        <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
          <h2 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 700, color: 'var(--color-text-main)' }}>
            {isLogin ? 'Welcome Back' : 'Create Account'}
          </h2>
          <p style={{ margin: '0.5rem 0 0', color: 'var(--color-text-secondary)', fontSize: '0.95rem' }}>
            Sign in to ChatFlow
          </p>
        </div>

        {error && (
          <div style={{ 
            color: '#ef4444', 
            backgroundColor: '#fee2e2',
            padding: '0.75rem',
            borderRadius: 'var(--radius-sm)',
            fontSize: '0.85rem', 
            textAlign: 'center' 
          }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-text-main)' }}>Email</label>
            <input
              className="input-base"
              type="email"
              placeholder="you@company.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
            />
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-text-main)' }}>Password</label>
            <input
              className="input-base"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />
          </div>

          <button type="submit" className="btn btn-primary" style={{ marginTop: '0.5rem', padding: '0.75rem' }}>
            {isLogin ? 'Sign In' : 'Sign Up'}
          </button>
        </form>
        
        <div style={{ textAlign: 'center', marginTop: '1rem' }}>
          <span style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem' }}>
            {isLogin ? "Don't have an account? " : "Already have an account? "}
          </span>
          <button 
            style={{ 
              background: 'none', 
              border: 'none', 
              color: 'var(--color-primary)', 
              fontWeight: 600, 
              cursor: 'pointer',
              fontSize: '0.9rem',
              padding: 0
            }}
            onClick={() => setIsLogin(!isLogin)}
          >
            {isLogin ? 'Sign up' : 'Sign in'}
          </button>
        </div>
      </div>
    </div>
  )
}
