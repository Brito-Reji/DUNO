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
}

interface GameState {
  deck: Card[]
  discardPile: Card[]
  hands: Record<string, Card[]>
  currentTurnIndex: number
  direction: 1 | -1
  activeColor: 'red' | 'blue' | 'green' | 'yellow'
  activeValue: string
  accumulatedPenalty: number
  pendingPenaltyType: '+2' | '+4' | null
  drawnCardId: string | null
  canPassTurn: boolean
  unoCalls: Record<string, boolean>
  winnerId: string | null
  logs: Array<{ id: string; text: string; time: number }>
}

interface RoomData {
  id: string
  players: Player[]
  status?: 'waiting' | 'playing'
  gameState?: GameState
}

export default function Room() {
  const { roomId } = useParams()
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
      socketRef.current.emit('leave-room', { roomId })
      socketRef.current.disconnect()
    }
    navigate('/')
  }

  // check if room exists
  useEffect(() => {
    fetch(`http://localhost:3005/api/rooms/${roomId}`)
      .then(res => res.json())
      .then(data => {
        if (data.exists) {
          setStatus('found')
        } else {
          setStatus('not-found')
        }
      })
      .catch(() => setStatus('not-found'))
  }, [roomId])

  // connect socket when room and username are ready
  useEffect(() => {
    if (status !== 'found' || !username || !roomId) return

    const socket = io('http://localhost:3005')
    socketRef.current = socket

    // join room
    socket.emit('join-room', { roomId, username })

    // listen for room updates
    socket.on('room-update', (room: RoomData) => {
      setRoomData(room)
    })

    // listen for ping updates of all players
    socket.on('ping-update', ({ playerId, ping, isOnline }: { playerId: string; ping: number; isOnline: boolean }) => {
      setRoomData(prev => {
        if (!prev) return prev
        return {
          ...prev,
          players: prev.players.map(p => p.id === playerId ? { ...p, ping, isOnline } : p)
        }
      })
    })

    // listen for pong response
    socket.on('pong-check', ({ timestamp }: { timestamp: number }) => {
      const latency = Date.now() - timestamp
      setMyPing(latency)
      socket.emit('player-ping', { roomId, ping: latency })
    })

    // measure ping regularly
    const pingInterval = setInterval(() => {
      if (socket.connected) {
        socket.emit('ping-check', { timestamp: Date.now() })
      }
    }, 2000)

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
  }, [status, username, roomId])

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
      socketRef.current.emit('start-game', { roomId })
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
  const playerCount = roomData?.players.length || 0
  const canStartGame = playerCount >= 2

  // in-game arena view
  if (roomData?.status === 'playing' && roomData.gameState) {
    return (
      <main className="game-wrapper-fullscreen">
        {gameError && <div className="floating-error">{gameError}</div>}
        <GameBoard
          roomId={roomId!}
          players={roomData.players}
          gameState={roomData.gameState}
          socket={socketRef.current}
          currentSocketId={currentSocketId}
          isHost={isCurrentHost}
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
          canStartGame ? (
            <button className="btn btn-play" onClick={handleStartGame}>
              ▶ Start Game
            </button>
          ) : (
            <div className="waiting-pill">
              Waiting for at least 1 more player to join (2+ players required)
            </div>
          )
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
