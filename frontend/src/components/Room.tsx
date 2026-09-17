import { useEffect, useState, useRef, type FormEvent } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { io, type Socket } from 'socket.io-client'
import GameBoard from './GameBoard'
import type { Card } from './UnoCard'

export interface Player {
  id: string
  name: string
  isHost: boolean
  ping?: number
  isOnline?: boolean
  wins?: number
  isSpectator?: boolean
}

interface GameState {
  deck: Card[]
  discardPile: Card[]
  hands: Record<string, Card[]>
  currentTurnIndex: number
  direction: 1 | -1
  activeColor: 'red' | 'blue' | 'green' | 'yellow' | 'orange' | 'pink' | 'teal' | 'purple' | 'wild'
  activeValue: string
  accumulatedPenalty: number
  pendingPenaltyType: '+2' | '+4' | null
  drawnCardId: string | null
  canPassTurn: boolean
  unoCalls: Record<string, boolean>
  winnerId: string | null
  logs: Array<{ id: string; text: string; time: number }>
  mode: 'normal' | 'flip'
  side: 'light' | 'dark'
}

interface RoomData {
  id: string
  players: Player[]
  status?: 'waiting' | 'playing'
  mode?: 'normal' | 'flip'
  gameState?: GameState
}

export default function Room() {
  const { roomId } = useParams()
  const cleanRoomId = (roomId || '').trim().toLowerCase()
  const [status, setStatus] = useState<'loading' | 'found' | 'not-found'>('loading')
  const [username, setUsername] = useState(() => localStorage.getItem('uno_username') || '')
  const [tempUsername, setTempUsername] = useState('')
  const [nameError, setNameError] = useState('')
  const [gameError, setGameError] = useState('')
  const [copied, setCopied] = useState(false)
  const [roomData, setRoomData] = useState<RoomData | null>(null)
  const [myPing, setMyPing] = useState<number | null>(null)
  const socketRef = useRef<Socket | null>(null)
  const navigate = useNavigate()

  // leave room
  const handleLeaveRoom = () => {
    if (socketRef.current) {
      socketRef.current.emit('leave-room', { roomId: cleanRoomId })
      socketRef.current.disconnect()
    }
    navigate('/')
  }

  // check if room exists
  useEffect(() => {
    if (!cleanRoomId) {
      setStatus('not-found')
      return
    }
    fetch(`/api/rooms/${cleanRoomId}`)
      .then(res => res.json())
      .then(data => {
        if (data.exists) {
          setStatus('found')
        } else {
          setStatus('not-found')
        }
      })
      .catch(() => setStatus('not-found'))
  }, [cleanRoomId])

  // connect socket when room and username are ready
  useEffect(() => {
    if (status !== 'found' || !username || !cleanRoomId) return

    const socket = io()
    socketRef.current = socket

    // join room
    socket.emit('join-room', { roomId: cleanRoomId, username })

    // listen for room updates
    socket.on('room-update', (room: RoomData) => {
      setRoomData(room)
    })

    // ping update
    socket.on('ping-update', ({ playerId, ping, isOnline }: { playerId: string; ping: number; isOnline: boolean }) => {
      setRoomData(prev => {
        if (!prev) return prev
        const player = prev.players.find(p => p.id === playerId)
        if (player && Math.abs((player.ping || 0) - ping) < 30 && player.isOnline === isOnline) {
          return prev
        }
        return {
          ...prev,
          players: prev.players.map(p => p.id === playerId ? { ...p, ping, isOnline } : p)
        }
      })
    })

    // pong response
    socket.on('pong-check', ({ timestamp }: { timestamp: number }) => {
      const latency = Date.now() - timestamp
      setMyPing(latency)
      socket.emit('player-ping', { roomId: cleanRoomId, ping: latency })
    })

    // ping interval
    const pingInterval = setInterval(() => {
      if (socket.connected) {
        socket.emit('ping-check', { timestamp: Date.now() })
      }
    }, 10000)

    // initial ping
    socket.emit('ping-check', { timestamp: Date.now() })

    // listen for game error
    socket.on('game-error', (msg: string) => {
      setGameError(msg)
      setTimeout(() => setGameError(''), 3000)
    })

    // handle room error
    socket.on('room-error', () => {
      setStatus('not-found')
    })

    return () => {
      clearInterval(pingInterval)
      socket.disconnect()
    }
  }, [status, username, cleanRoomId])

  // save username from prompt
  const handleSaveName = (e: FormEvent) => {
    e.preventDefault()
    const trimmed = tempUsername.trim()
    if (!trimmed) {
      setNameError('Please enter a username')
      return
    }
    localStorage.setItem('uno_username', trimmed)
    setUsername(trimmed)
  }

  // start game
  const handleStartGame = () => {
    if (socketRef.current) {
      socketRef.current.emit('start-game', { roomId: cleanRoomId })
    }
  }

  // change mode
  const handleChangeMode = (mode: 'normal' | 'flip') => {
    if (socketRef.current) {
      socketRef.current.emit('change-mode', { roomId: cleanRoomId, mode })
    }
  }

  // copy invite link
  const copyLink = () => {
    navigator.clipboard.writeText(window.location.href)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (status === 'loading') {
    return (
      <div className="container">
        <h2>Loading room...</h2>
      </div>
    )
  }

  if (status === 'not-found') {
    return (
      <div className="container">
        <h1>Room Not Found</h1>
        <p>The room you are trying to join does not exist or has expired.</p>
        <Link to="/" className="btn btn-secondary" style={{ display: 'block', textDecoration: 'none', textAlign: 'center' }}>
          Go to Home
        </Link>
      </div>
    )
  }

  // prompt username if missing
  if (!username) {
    return (
      <div className="container">
        <div className="uno-logo-badge">UNO</div>
        <h1>Join Room</h1>
        <p>Enter your username to enter Room {roomId}</p>

        {nameError && <div className="error-msg">{nameError}</div>}

        <form onSubmit={handleSaveName}>
          <div className="input-group">
            <input
              type="text"
              placeholder="Enter your nickname"
              value={tempUsername}
              maxLength={15}
              onChange={(e) => {
                setTempUsername(e.target.value)
                if (nameError) setNameError('')
              }}
              autoFocus
            />
          </div>
          <button type="submit" className="btn btn-primary">
            Enter Game
          </button>
        </form>
      </div>
    )
  }

  const currentSocketId = socketRef.current?.id || ''
  const isCurrentHost = roomData?.players.some(p => p.id === currentSocketId && p.isHost) ?? false
  const isMeSpectator = roomData?.players.find(p => p.id === currentSocketId)?.isSpectator ?? false
  const playerCount = roomData?.players.length || 0
  const canStartGame = playerCount >= 2

  // in-game arena view
  if (roomData?.status === 'playing' && roomData.gameState) {
    return (
      <main className={`game-wrapper-fullscreen ${roomData.gameState.mode === 'flip' && roomData.gameState.side === 'dark' ? 'theme-dark' : 'theme-light'}`}>
        {gameError && <div className="floating-error">{gameError}</div>}
        <GameBoard
          roomId={roomId!}
          players={roomData.players}
          gameState={roomData.gameState}
          socket={socketRef.current}
          currentSocketId={currentSocketId}
          isHost={isCurrentHost}
          isSpectator={isMeSpectator}
          myPing={myPing}
          onLeaveRoom={handleLeaveRoom}
        />
      </main>
    )
  }

  return (
    <div className="home-stage">
      <div className="container room-container">
      <div className="room-header">
        <div className="header-meta-row">
          <div className="uno-logo-badge">UNO LOBBY</div>
          {myPing !== null && (
            <div className={`ping-badge ${myPing < 100 ? 'ping-good' : myPing < 250 ? 'ping-medium' : 'ping-poor'}`}>
              <span className="ping-dot">●</span> {myPing} ms
            </div>
          )}
        </div>
        <h1>Room {roomId}</h1>
        <p>Share the code or link with friends to play</p>
      </div>

      <div className="room-code-display">
        <span>Room Code</span>
        <h2>{roomId}</h2>
      </div>

      <div className="room-mode-display">
        <span>Game Mode: <strong>{roomData?.mode === 'flip' ? 'UNO Flip' : 'Normal UNO'}</strong></span>
      </div>

      <div className="players-section">
        <div className="players-header">
          <h3>Players</h3>
          <span className="player-count">{playerCount}/10</span>
        </div>

        <div className="players-list">
          {roomData?.players.map((player) => {
            const isMe = player.id === currentSocketId
            const displayPing = isMe ? myPing : player.ping
            const isOnline = player.isOnline !== false

            return (
              <div key={player.id} className={`player-card ${isMe ? 'is-me' : ''}`}>
                <div className="player-avatar">
                  {player.name.slice(0, 2).toUpperCase()}
                </div>
                <div className="player-info">
                  <div className="player-name-row">
                    <span className="player-name">{player.name}</span>
                    {(player.wins || 0) > 0 && (
                      <span className="player-wins-badge" title={`${player.wins} wins in this room`}>
                        🏆 {player.wins}
                      </span>
                    )}
                    {isMe && <span className="tag tag-you">YOU</span>}
                    {player.isHost && <span className="tag tag-host">👑 HOST</span>}
                  </div>
                </div>

                <div className="player-net-status">
                  {!isOnline ? (
                    <span className="net-offline">Offline</span>
                  ) : displayPing !== null && displayPing !== undefined ? (
                    <span className={`net-ping ${displayPing < 100 ? 'ping-good' : displayPing < 250 ? 'ping-medium' : 'ping-poor'}`}>
                      <span className="ping-dot">●</span> {displayPing} ms
                    </span>
                  ) : (
                    <span className="net-ping ping-good">
                      <span className="ping-dot">●</span> Online
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* host play action or waiting status */}
      <div className="host-play-section">
        {isCurrentHost ? (
          <>
            <div className="mode-toggle-section" style={{ marginBottom: '1rem', display: 'flex', gap: '1rem', justifyContent: 'center' }}>
              <button 
                className={`btn ${roomData?.mode !== 'flip' ? 'btn-primary' : 'btn-secondary'}`} 
                onClick={() => handleChangeMode('normal')}
              >
                Normal UNO
              </button>
              <button 
                className={`btn ${roomData?.mode === 'flip' ? 'btn-primary' : 'btn-secondary'}`} 
                onClick={() => handleChangeMode('flip')}
              >
                UNO Flip
              </button>
            </div>
            {canStartGame ? (
              <button className="btn btn-play" onClick={handleStartGame}>
                ▶ Start Game
              </button>
            ) : (
              <div className="waiting-pill">
                Waiting for at least 1 more player to join (2+ players required)
              </div>
            )}
          </>
        ) : (
          <div className="waiting-pill">
            {canStartGame ? 'Waiting for host to start the game...' : 'Waiting for more players to join...'}
          </div>
        )}
      </div>

      <div className="room-actions">
        <div className="room-url-box">{window.location.href}</div>
        <button className="btn btn-secondary" onClick={copyLink}>
          {copied ? '✓ Link Copied!' : 'Copy Invite Link'}
        </button>

        <button 
          className="btn btn-neutral" 
          onClick={handleLeaveRoom}
          style={{ display: 'block', width: '100%', textDecoration: 'none', textAlign: 'center', marginTop: '0.5rem', cursor: 'pointer' }}
        >
          Leave Room
        </button>
      </div>
    </div>
    </div>
  )
}
