import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { BACKEND_URL } from '../utils/config'

interface SystemStats {
  uptimeSeconds: number
  memory: {
    rssMb: number
    heapUsedMb: number
    heapTotalMb: number
    externalMb: number
  }
  totalRooms: number
  playingRooms: number
  waitingRooms: number
  totalPlayers: number
  totalSpectators: number
}

interface AdminPlayer {
  id: string
  name: string
  isHost: boolean
  isSpectator: boolean
  ping: number
  isOnline: boolean
  wins: number
  cardCount: number
}

interface AdminRoom {
  id: string
  createdAt: string
  status: 'waiting' | 'playing'
  mode: 'normal' | 'flip'
  playersCount: number
  spectatorsCount: number
  players: AdminPlayer[]
  gameState?: {
    side: 'light' | 'dark'
    activeColor: string
    activeValue: string
    direction: 1 | -1
    currentTurnPlayerName: string
    currentTurnPlayerId: string
    topDiscardCard?: { color: string; value: string }
    deckCount: number
    discardCount: number
    accumulatedPenalty: number
    pendingPenaltyType: string | null
    winnerId: string | null
    latestLog: string
  }
}

export default function AdminPortal() {
  const [adminKey, setAdminKey] = useState(() => localStorage.getItem('uno_admin_key') || '')
  const [isAuthenticated, setIsAuthenticated] = useState(() => Boolean(localStorage.getItem('uno_admin_key')))
  const [loginPassword, setLoginPassword] = useState('')
  const [loginError, setLoginError] = useState('')
  const [isLoggingIn, setIsLoggingIn] = useState(false)

  const [mainView, setMainView] = useState<'rooms' | 'logs'>('rooms')
  const [serverLogs, setServerLogs] = useState<string[]>([])
  const [stats, setStats] = useState<SystemStats | null>(null)
  const [rooms, setRooms] = useState<AdminRoom[]>([])
  const [loading, setLoading] = useState(true)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [filterTab, setFilterTab] = useState<'all' | 'playing' | 'waiting' | 'empty'>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const [terminatingRoomId, setTerminatingRoomId] = useState<string | null>(null)
  const [isPurging, setIsPurging] = useState(false)
  const intervalRef = useRef<number | null>(null)

  // show notification
  const showToast = (msg: string) => {
    setToastMessage(msg)
    setTimeout(() => setToastMessage(null), 3500)
  }

  // login admin
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!loginPassword) {
      setLoginError('Please enter the admin password')
      return
    }

    try {
      setIsLoggingIn(true)
      setLoginError('')
      const res = await fetch(`${BACKEND_URL}/api/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: loginPassword })
      })
      const data = await res.json()
      if (res.ok && data.success) {
        localStorage.setItem('uno_admin_key', data.token)
        setAdminKey(data.token)
        setIsAuthenticated(true)
        setLoginPassword('')
      } else {
        setLoginError(data.message || 'Invalid admin password')
      }
    } catch (err) {
      setLoginError('Failed to connect to server')
    } finally {
      setIsLoggingIn(false)
    }
  }

  // logout admin
  const handleLogout = () => {
    localStorage.removeItem('uno_admin_key')
    setAdminKey('')
    setIsAuthenticated(false)
  }

  // fetch data
  const fetchData = async () => {
    if (!adminKey && !localStorage.getItem('uno_admin_key')) return

    try {
      const key = adminKey || localStorage.getItem('uno_admin_key') || ''
      const res = await fetch(`${BACKEND_URL}/api/admin/overview`, {
        headers: { 'x-admin-key': key }
      })
      if (res.ok) {
        const data = await res.json()
        setStats(data.stats)
        setRooms(data.rooms)
      } else if (res.status === 401) {
        handleLogout()
        return
      }

      const logsRes = await fetch(`${BACKEND_URL}/api/admin/logs`, {
        headers: { 'x-admin-key': key }
      })
      if (logsRes.ok) {
        const logsData = await logsRes.json()
        setServerLogs(logsData.logs || [])
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  // initial load and auto refresh
  useEffect(() => {
    if (!isAuthenticated) return

    fetchData()

    if (autoRefresh) {
      intervalRef.current = setInterval(fetchData, 3000)
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [isAuthenticated, autoRefresh])

  // delete room
  const handleTerminateRoom = async (roomId: string) => {
    const confirm = window.confirm(`Terminate room #${roomId}? Connected players will be disconnected and room memory freed.`)
    if (!confirm) return

    try {
      setTerminatingRoomId(roomId)
      const res = await fetch(`${BACKEND_URL}/api/admin/rooms/${roomId}`, { 
        method: 'DELETE',
        headers: { 'x-admin-key': adminKey }
      })
      const data = await res.json()
      if (data.success) {
        showToast(`✓ Room #${roomId} terminated. Memory reclaimed!`)
        fetchData()
      }
    } catch (err) {
      console.error(err)
      showToast(`Failed to terminate room #${roomId}`)
    } finally {
      setTerminatingRoomId(null)
    }
  }

  // purge empty rooms
  const handlePurgeEmptyRooms = async () => {
    try {
      setIsPurging(true)
      const res = await fetch(`${BACKEND_URL}/api/admin/cleanup-empty`, { 
        method: 'POST',
        headers: { 'x-admin-key': adminKey }
      })
      const data = await res.json()
      showToast(`⚡ Purged ${data.cleanedCount} inactive empty room(s)!`)
      fetchData()
    } catch (err) {
      console.error(err)
      showToast('Failed to purge empty rooms')
    } finally {
      setIsPurging(false)
    }
  }

  // kick player
  const handleKickPlayer = async (roomId: string, playerId: string, playerName: string) => {
    const confirm = window.confirm(`Kick ${playerName} from room #${roomId}?`)
    if (!confirm) return

    try {
      const res = await fetch(`${BACKEND_URL}/api/admin/rooms/${roomId}/kick/${playerId}`, { 
        method: 'POST',
        headers: { 'x-admin-key': adminKey }
      })
      if (res.ok) {
        showToast(`👢 ${playerName} was kicked from room #${roomId}`)
        fetchData()
      }
    } catch (err) {
      console.error(err)
    }
  }

  // format uptime
  const formatUptime = (totalSeconds: number) => {
    const hours = Math.floor(totalSeconds / 3600)
    const minutes = Math.floor((totalSeconds % 3600) / 60)
    const seconds = totalSeconds % 60
    return `${hours}h ${minutes}m ${seconds}s`
  }

  // filter rooms
  const filteredRooms = rooms.filter(room => {
    if (filterTab === 'playing' && room.status !== 'playing') return false
    if (filterTab === 'waiting' && room.status !== 'waiting') return false
    if (filterTab === 'empty' && room.playersCount > 0) return false

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      const matchId = room.id.toLowerCase().includes(q)
      const matchPlayer = room.players.some(p => p.name.toLowerCase().includes(q))
      return matchId || matchPlayer
    }
    return true
  })

  // login screen
  if (!isAuthenticated) {
    return (
      <div className="home-stage">
        <div className="container landing-card admin-login-card">
          <div className="brand-header">
            <div className="uno-logo-badge admin-badge">ADMIN</div>
            <h1>Admin Authentication</h1>
            <p className="brand-tagline">Enter administrator password to access live room management</p>
          </div>

          {loginError && <div className="error-msg">{loginError}</div>}

          <form onSubmit={handleLogin} className="action-card">
            <div className="input-group">
              <label className="input-label">Admin Password</label>
              <input
                type="password"
                placeholder="Enter admin password"
                value={loginPassword}
                onChange={(e) => {
                  setLoginPassword(e.target.value)
                  if (loginError) setLoginError('')
                }}
                autoFocus
              />
            </div>

            <button 
              type="submit" 
              className="btn btn-primary btn-glow"
              disabled={isLoggingIn}
            >
              {isLoggingIn ? 'Verifying...' : '🔓 Access Portal'}
            </button>
          </form>

          <div style={{ marginTop: '1.2rem', textAlign: 'center' }}>
            <Link to="/" style={{ color: '#94a3b8', fontSize: '0.85rem', textDecoration: 'none' }}>
              ← Return to Game
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="admin-page-layout">
      {/* Toast Alert */}
      {toastMessage && (
        <div className="admin-floating-toast">
          {toastMessage}
        </div>
      )}

      {/* Top Admin Navbar */}
      <header className="admin-navbar">
        <div className="admin-nav-left">
          <div className="uno-logo-badge admin-badge">ADMIN</div>
          <div className="admin-title-group">
            <h1>Server Management Portal</h1>
            <span className="admin-subtitle">Live room inspector & memory control</span>
          </div>
        </div>

        <div className="admin-nav-right">
          <div className="admin-uptime-pill">
            <span>⏱️ Uptime:</span>
            <strong>{stats ? formatUptime(stats.uptimeSeconds) : '...'}</strong>
          </div>

          <button 
            className={`btn-admin-pill ${autoRefresh ? 'pill-active' : ''}`}
            onClick={() => setAutoRefresh(!autoRefresh)}
          >
            <span className="ping-dot" style={{ color: autoRefresh ? '#4ade80' : '#94a3b8' }}>●</span>
            {autoRefresh ? 'Live Polling ON' : 'Polling Paused'}
          </button>

          <button className="btn btn-secondary btn-sm" onClick={fetchData}>
            🔄 Refresh
          </button>

          <button 
            className="btn btn-warning btn-sm" 
            onClick={handlePurgeEmptyRooms}
            disabled={isPurging}
          >
            ⚡ Clean Empty Rooms
          </button>

          <button className="btn btn-neutral btn-sm" onClick={handleLogout} title="Logout of admin">
            🔒 Logout
          </button>

          <Link to="/" className="btn btn-neutral btn-sm">
            🎮 Game Home
          </Link>
        </div>
      </header>

      <div className="admin-filter-bar" style={{ marginBottom: '1rem', justifyContent: 'center' }}>
        <div className="filter-tabs">
          <button 
            className={`tab-btn ${mainView === 'rooms' ? 'active' : ''}`}
            onClick={() => setMainView('rooms')}
          >
            📊 Rooms Dashboard
          </button>
          <button 
            className={`tab-btn ${mainView === 'logs' ? 'active' : ''}`}
            onClick={() => setMainView('logs')}
          >
            📋 System Logs
          </button>
        </div>
      </div>

      {mainView === 'logs' && (
        <section className="admin-logs-section" style={{ padding: '0 2rem 2rem 2rem' }}>
          <div className="logs-container" style={{ background: '#0d1117', color: '#c9d1d9', padding: '1rem', height: '600px', overflowY: 'auto', fontFamily: 'monospace', borderRadius: '8px', border: '1px solid #30363d', fontSize: '13px' }}>
            {serverLogs.length === 0 ? <div>No logs available</div> : null}
            {serverLogs.map((log, i) => {
              const isError = log.includes('error') || log.includes('WARN');
              return (
                <div key={i} style={{ whiteSpace: 'pre-wrap', marginBottom: '0.2rem', color: isError ? '#ff7b72' : 'inherit' }}>{log}</div>
              )
            })}
          </div>
        </section>
      )}

      {/* System Metrics Grid */}
      {mainView === 'rooms' && stats && (
        <section className="admin-stats-grid">
          {/* Memory Metric Card */}
          <div className="admin-metric-card metric-memory">
            <div className="metric-header">
              <span className="metric-icon">💾</span>
              <span className="metric-label">Memory Allocation (RAM)</span>
            </div>
            <div className="metric-main-val">
              {stats.memory.heapUsedMb} <span className="metric-unit">MB / {stats.memory.heapTotalMb} MB</span>
            </div>
            <div className="memory-progress-bar">
              <div 
                className="memory-progress-fill" 
                style={{ 
                  width: `${Math.min(100, (stats.memory.heapUsedMb / stats.memory.heapTotalMb) * 100)}%` 
                }} 
              />
            </div>
            <div className="metric-sub-row">
              <span>RSS: <strong>{stats.memory.rssMb} MB</strong></span>
              <span>External: <strong>{stats.memory.externalMb} MB</strong></span>
            </div>
          </div>

          {/* Rooms Metric Card */}
          <div className="admin-metric-card">
            <div className="metric-header">
              <span className="metric-icon">🏟️</span>
              <span className="metric-label">Active Game Rooms</span>
            </div>
            <div className="metric-main-val">
              {stats.totalRooms} <span className="metric-unit">Rooms</span>
            </div>
            <div className="metric-pills-row">
              <span className="stat-chip chip-playing">
                🟢 {stats.playingRooms} In-Game
              </span>
              <span className="stat-chip chip-waiting">
                🟡 {stats.waitingRooms} In Lobby
              </span>
            </div>
          </div>

          {/* Connected Players Card */}
          <div className="admin-metric-card">
            <div className="metric-header">
              <span className="metric-icon">👥</span>
              <span className="metric-label">Connected Players</span>
            </div>
            <div className="metric-main-val">
              {stats.totalPlayers} <span className="metric-unit">Players</span>
            </div>
            <div className="metric-pills-row">
              <span className="stat-chip chip-spectators">
                👁️ {stats.totalSpectators} Spectators
              </span>
            </div>
          </div>
        </section>
      )}

      {/* Rooms Explorer Section */}
      {mainView === 'rooms' && (
      <section className="admin-rooms-section">
        <div className="admin-filter-bar">
          <div className="filter-tabs">
            <button 
              className={`tab-btn ${filterTab === 'all' ? 'active' : ''}`}
              onClick={() => setFilterTab('all')}
            >
              All Rooms ({rooms.length})
            </button>
            <button 
              className={`tab-btn ${filterTab === 'playing' ? 'active' : ''}`}
              onClick={() => setFilterTab('playing')}
            >
              🟢 In-Game ({rooms.filter(r => r.status === 'playing').length})
            </button>
            <button 
              className={`tab-btn ${filterTab === 'waiting' ? 'active' : ''}`}
              onClick={() => setFilterTab('waiting')}
            >
              🟡 In Lobby ({rooms.filter(r => r.status === 'waiting').length})
            </button>
            <button 
              className={`tab-btn ${filterTab === 'empty' ? 'active' : ''}`}
              onClick={() => setFilterTab('empty')}
            >
              ⚪ Empty ({rooms.filter(r => r.playersCount === 0).length})
            </button>
          </div>

          <div className="search-input-group">
            <input 
              type="text" 
              placeholder="Search by room code or player name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button className="clear-search-btn" onClick={() => setSearchQuery('')}>×</button>
            )}
          </div>
        </div>

        {/* Room Cards Grid */}
        {loading ? (
          <div className="admin-loading-card">
            <h3>Scanning server state...</h3>
          </div>
        ) : filteredRooms.length === 0 ? (
          <div className="admin-empty-state">
            <span className="empty-icon">📭</span>
            <h3>No rooms match your filter</h3>
            <p>Create a new game or purge empty rooms to optimize server memory.</p>
          </div>
        ) : (
          <div className="admin-rooms-grid">
            {filteredRooms.map(room => {
              const isPlaying = room.status === 'playing'
              const game = room.gameState

              return (
                <div key={room.id} className={`admin-room-card ${isPlaying ? 'room-live' : 'room-lobby'}`}>
                  {/* Card Header */}
                  <div className="room-card-top">
                    <div className="room-id-group">
                      <span className="room-code-tag">#{room.id}</span>
                      <span className={`status-pill ${isPlaying ? 'status-playing' : 'status-waiting'}`}>
                        {isPlaying ? '● LIVE MATCH' : '● IN LOBBY'}
                      </span>
                      <span className="mode-pill">
                        {room.mode === 'flip' ? '🔄 UNO Flip' : '🃏 Normal UNO'}
                      </span>
                    </div>

                    <div className="room-actions-bar">
                      <Link 
                        to={`/room/${room.id}`} 
                        className="btn-admin-action btn-spectate"
                        title="Enter & spectate live room"
                      >
                        👁️ Spectate / Join
                      </Link>
                      <button 
                        className="btn-admin-action btn-terminate"
                        onClick={() => handleTerminateRoom(room.id)}
                        disabled={terminatingRoomId === room.id}
                        title="Immediately terminate room and free memory"
                      >
                        {terminatingRoomId === room.id ? 'Freeing...' : '🗑️ Terminate'}
                      </button>
                    </div>
                  </div>

                  {/* Live Table Desk Status (if playing) */}
                  {isPlaying && game && (
                    <div className="admin-desk-preview">
                      <div className="desk-hud-row">
                        <div className="desk-hud-item">
                          <span className="hud-label">Active Color:</span>
                          <span className={`hud-val color-${game.activeColor}`}>
                            ● {game.activeColor.toUpperCase()}
                          </span>
                        </div>
                        <div className="desk-hud-item">
                          <span className="hud-label">Current Turn:</span>
                          <strong className="hud-val">{game.currentTurnPlayerName}</strong>
                        </div>
                        <div className="desk-hud-item">
                          <span className="hud-label">Side:</span>
                          <span className="hud-val">{game.side.toUpperCase()}</span>
                        </div>
                        <div className="desk-hud-item">
                          <span className="hud-label">Deck / Discard:</span>
                          <span className="hud-val">{game.deckCount} / {game.discardCount} cards</span>
                        </div>
                      </div>

                      {game.latestLog && (
                        <div className="desk-latest-log">
                          <span>Latest action:</span> <em>"{game.latestLog}"</em>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Players list */}
                  <div className="room-players-box">
                    <div className="players-box-header">
                      <span>Players ({room.playersCount})</span>
                      {room.spectatorsCount > 0 && (
                        <span className="spectators-sub">👁️ {room.spectatorsCount} Spectators</span>
                      )}
                    </div>

                    {room.players.length === 0 ? (
                      <div className="no-players-text">
                        No players connected. Scheduled for memory cleanup.
                      </div>
                    ) : (
                      <div className="admin-players-list">
                        {room.players.map(p => (
                          <div key={p.id} className="admin-player-row">
                            <div className="player-meta-left">
                              <span className="admin-player-avatar">
                                {p.name.slice(0, 2).toUpperCase()}
                              </span>
                              <span className="admin-player-name">{p.name}</span>
                              {p.isHost && <span className="tag-host-small">👑 Host</span>}
                              {p.isSpectator && <span className="tag-spectator-small">👁️ Spec</span>}
                              {p.wins > 0 && <span className="tag-wins-small">🏆 {p.wins}</span>}
                            </div>

                            <div className="player-meta-right">
                              {isPlaying && !p.isSpectator && (
                                <span className="admin-hand-pill">
                                  {p.cardCount} cards
                                </span>
                              )}
                              <span className={`admin-ping-pill ${p.ping < 100 ? 'ping-good' : 'ping-poor'}`}>
                                {p.ping}ms
                              </span>
                              <button 
                                className="admin-kick-btn"
                                onClick={() => handleKickPlayer(room.id, p.id, p.name)}
                                title={`Kick ${p.name}`}
                              >
                                👢
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>
      )}
    </div>
  )
}
