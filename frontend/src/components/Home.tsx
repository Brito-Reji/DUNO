import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { BACKEND_URL } from '../utils/config'
import logger from '../utils/logger'

export default function Home() {
  const [username, setUsername] = useState(() => localStorage.getItem('uno_username') || '')
  const [joinCode, setJoinCode] = useState('')
  const [error, setError] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const navigate = useNavigate()

  // save username
  const saveUser = (name: string) => {
    const trimmed = name.trim()
    localStorage.setItem('uno_username', trimmed)
    return trimmed
  }

  // create room
  const handleCreateRoom = async () => {
    const user = username.trim()
    if (!user) {
      setError('Please enter a username')
      return
    }
    saveUser(user)

    try {
      setIsCreating(true)
      setError('')
      const res = await fetch(`${BACKEND_URL}/api/rooms`, { method: 'POST' })
      const data = await res.json()
      if (data.roomId) {
        navigate(`/room/${data.roomId}`)
      }
    } catch (err) {
      logger.error('handleCreateRoom error:', err)
      setError('Failed to create room. Please try again.')
    } finally {
      setIsCreating(false)
    }
  }

  // join room
  const handleJoinRoom = (e: FormEvent) => {
    e.preventDefault()
    const user = username.trim()
    if (!user) {
      setError('Please enter a username')
      return
    }
    saveUser(user)

    let code = joinCode.trim()
    if (!code) {
      setError('Please enter a room code')
      return
    }

    // handle full url paste
    if (code.includes('/room/')) {
      code = code.split('/room/').pop()?.split('?')[0] || code
    }
    code = code.replace(/\/+$/, '').trim().toLowerCase()

    navigate(`/room/${code}`)
  }

  return (
    <div className="home-stage">
      <div className="container landing-card">
        <div className="brand-header">
          <div className="uno-logo-badge">UNO</div>
          <h1>UNO Online</h1>
          <p className="brand-tagline">Real-time multiplayer card battles with friends</p>
        </div>

        {error && <div className="error-msg">{error}</div>}

        <div className="input-group">
          <label className="input-label">Player Nickname</label>
          <input
            type="text"
            placeholder="Enter your nickname"
            value={username}
            maxLength={15}
            onChange={(e) => {
              setUsername(e.target.value)
              if (error) setError('')
            }}
          />
        </div>

        <div className="action-card">
          <button 
            className="btn btn-primary btn-glow" 
            onClick={handleCreateRoom}
            disabled={isCreating}
          >
            {isCreating ? 'Creating Room...' : '⚡ Create New Room'}
          </button>
        </div>

        <div className="divider">
          <span>OR JOIN BY CODE</span>
        </div>

        <form onSubmit={handleJoinRoom} className="action-card">
          <div className="input-group">
            <label className="input-label">Room Code</label>
            <input
              type="text"
              placeholder="Enter Room Code (e.g. 588981)"
              value={joinCode}
              onChange={(e) => {
                setJoinCode(e.target.value)
                if (error) setError('')
              }}
            />
          </div>
          <button type="submit" className="btn btn-secondary">
            Join Room
          </button>
        </form>

      </div>
    </div>
  )
}
