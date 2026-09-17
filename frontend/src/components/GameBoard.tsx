import { useState, useEffect, useRef } from 'react'
import UnoCard, { type Card } from './UnoCard'
import type { Socket } from 'socket.io-client'
import type { Player } from './Room'
import { sounds } from '../utils/sound'

interface GameLog {
  id: string
  text: string
  time: number
  playerId?: string
  privateText?: string
}

interface GameState {
  deck: Card[]
  discardPile: Card[]
  hands: Record<string, Card[]>
  currentTurnIndex: number
  direction: 1 | -1
  mode: 'normal' | 'flip'
  side: 'light' | 'dark'
  activeColor: 'red' | 'blue' | 'green' | 'yellow' | 'orange' | 'pink' | 'teal' | 'purple' | 'wild'
  activeValue: string
  accumulatedPenalty: number
  pendingPenaltyType: '+2' | '+4' | '+5' | 'wild_draw_color' | null
  drawnCardId: string | null
  canPassTurn: boolean
  unoCalls: Record<string, boolean>
  winnerId: string | null
  logs: GameLog[]
  turnStartedAt?: number
  turnExpiresAt?: number
}

interface GameBoardProps {
  roomId: string
  players: Player[]
  gameState: GameState
  socket: Socket | null
  currentSocketId: string
  isHost: boolean
  isSpectator?: boolean
  myPing: number | null
  onLeaveRoom?: () => void
}

interface FlyingCard {
  id: string
  startX: number
  startY: number
  deltaX: number
  deltaY: number
  delayMs: number
  arcOffset: number
  rotation: number
  isDark: boolean
}

interface PlayerImpact {
  count: number
  id: number
}

type ColorChoice = 'red' | 'blue' | 'green' | 'yellow' | 'orange' | 'pink' | 'teal' | 'purple'

export default function GameBoard({
  roomId,
  players,
  gameState,
  socket,
  currentSocketId,
  isHost,
  isSpectator = false,
  myPing,
  onLeaveRoom
}: GameBoardProps) {
  const [selectedWildCard, setSelectedWildCard] = useState<Card | null>(null)
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [isHandFlipped, setIsHandFlipped] = useState(false)
  const [isMuted, setIsMuted] = useState(sounds.isMuted())
  const [actionNotice, setActionNotice] = useState<string | null>(null)
  const [timeLeft, setTimeLeft] = useState<number>(20)
  const [flyingCards, setFlyingCards] = useState<FlyingCard[]>([])
  const [playerImpacts, setPlayerImpacts] = useState<Record<string, PlayerImpact>>({})
  const confettiCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const prevTurnRef = useRef<boolean>(false)
  const fanContainerRef = useRef<HTMLDivElement | null>(null)
  const prevHandsRef = useRef<Record<string, number>>({})
  const lastAnimatedTimeRef = useRef<Record<string, number>>({})
  const isPointerDownRef = useRef(false)
  const isDraggingRef = useRef(false)
  const startXRef = useRef(0)
  const scrollLeftRef = useRef(0)
  const [isGrabbing, setIsGrabbing] = useState(false)

  // trigger draw cards animation
  const animateDrawCards = (playerId: string, count: number) => {
    if (count <= 0) return
    const drawPileEl = document.getElementById('draw-pile-source')
    const playerEl = document.getElementById(`player-turn-node-${playerId}`)

    if (!drawPileEl || !playerEl) return

    const drawRect = drawPileEl.getBoundingClientRect()
    const playerRect = playerEl.getBoundingClientRect()

    const startX = drawRect.left + drawRect.width / 2
    const startY = drawRect.top + drawRect.height / 2
    const targetX = playerRect.left + playerRect.width / 2
    const targetY = playerRect.top + playerRect.height / 2

    const deltaX = targetX - startX
    const deltaY = targetY - startY
    const isDark = gameState.mode === 'flip' && gameState.side === 'dark'

    const visualCount = Math.min(count, 8)
    const newCards: FlyingCard[] = []
    const batchId = Date.now()

    for (let i = 0; i < visualCount; i++) {
      const delayMs = i * 65
      const arcOffset = (Math.random() - 0.5) * 60
      const rotation = (Math.random() - 0.5) * 50 + (deltaX > 0 ? 20 : -20)

      newCards.push({
        id: `${batchId}-${i}-${Math.random()}`,
        startX,
        startY,
        deltaX,
        deltaY,
        delayMs,
        arcOffset,
        rotation,
        isDark
      })

      setTimeout(() => {
        sounds.playCardFly(i)
      }, delayMs)
    }

    setFlyingCards(prev => [...prev, ...newCards])

    // impact at target
    const arrivalTime = (visualCount - 1) * 65 + 380
    setTimeout(() => {
      setPlayerImpacts(prev => ({
        ...prev,
        [playerId]: { count, id: Date.now() }
      }))
    }, arrivalTime)

    // clear impact
    setTimeout(() => {
      setPlayerImpacts(prev => {
        const next = { ...prev }
        delete next[playerId]
        return next
      })
    }, arrivalTime + 900)

    // remove flying cards
    setTimeout(() => {
      setFlyingCards(prev => prev.filter(c => !newCards.some(nc => nc.id === c.id)))
    }, (visualCount * 65) + 750)
  }

  // listen for draw events
  useEffect(() => {
    if (!socket) return

    const handlePlayerDrew = ({ playerId, count }: { playerId: string; count: number }) => {
      lastAnimatedTimeRef.current[playerId] = Date.now()
      animateDrawCards(playerId, count)
    }

    socket.on('player-drew-cards', handlePlayerDrew)
    return () => {
      socket.off('player-drew-cards', handlePlayerDrew)
    }
  }, [socket, gameState.mode, gameState.side])

  // fallback for hand count changes
  useEffect(() => {
    if (!gameState.hands) return
    Object.entries(gameState.hands).forEach(([pId, hand]) => {
      const prevCount = prevHandsRef.current[pId]
      const currCount = hand.length
      if (prevCount !== undefined && currCount > prevCount) {
        const diff = currCount - prevCount
        const lastTime = lastAnimatedTimeRef.current[pId] || 0
        if (Date.now() - lastTime > 400 && !gameState.winnerId) {
          animateDrawCards(pId, diff)
        }
      }
      prevHandsRef.current[pId] = currCount
    })
  }, [gameState.hands, gameState.mode, gameState.side, gameState.winnerId])

  // 20s turn countdown
  useEffect(() => {
    if (gameState.winnerId) return

    const updateTimer = () => {
      if (gameState.turnExpiresAt) {
        const remaining = Math.max(0, Math.ceil((gameState.turnExpiresAt - Date.now()) / 1000))
        setTimeLeft(remaining)
      } else {
        setTimeLeft(20)
      }
    }

    updateTimer()
    const interval = setInterval(updateTimer, 200)
    return () => clearInterval(interval)
  }, [gameState.turnExpiresAt, gameState.turnStartedAt, gameState.currentTurnIndex, gameState.winnerId])

  // mouse drag scroll
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0 || !fanContainerRef.current) return
    const rect = fanContainerRef.current.getBoundingClientRect()
    if (e.clientY > rect.bottom - 10) return

    isPointerDownRef.current = true
    startXRef.current = e.pageX
    scrollLeftRef.current = fanContainerRef.current.scrollLeft
  }

  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (!isPointerDownRef.current || !fanContainerRef.current) return
      const dx = e.pageX - startXRef.current
      if (Math.abs(dx) > 6) {
        if (!isDraggingRef.current) {
          isDraggingRef.current = true
          setIsGrabbing(true)
        }
        fanContainerRef.current.scrollLeft = scrollLeftRef.current - dx
      }
    }

    const handleGlobalMouseUp = () => {
      if (isPointerDownRef.current) {
        isPointerDownRef.current = false
        setIsGrabbing(false)
        if (isDraggingRef.current) {
          setTimeout(() => {
            isDraggingRef.current = false
          }, 60)
        }
      }
    }

    window.addEventListener('mousemove', handleGlobalMouseMove)
    window.addEventListener('mouseup', handleGlobalMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove)
      window.removeEventListener('mouseup', handleGlobalMouseUp)
    }
  }, [])

  const activePlayers = players.filter(p => !p.isSpectator)
  const spectatorPlayers = players.filter(p => p.isSpectator)
  const currentTurnPlayer = activePlayers[gameState.currentTurnIndex]
  const isMyTurn = !isSpectator && currentTurnPlayer?.id === currentSocketId
  const myHand = isSpectator ? [] : (gameState.hands[currentSocketId] || [])
  const topDiscard = gameState.discardPile[gameState.discardPile.length - 1]
  const canPassOrSkip = !isSpectator && isMyTurn && gameState.canPassTurn

  // sound and banner on log update
  useEffect(() => {
    if (gameState.logs.length > 0) {
      const latest = gameState.logs[0]
      const textToDisplay = (latest.playerId === currentSocketId && latest.privateText)
        ? latest.privateText
        : latest.text
      if (textToDisplay) {
        setActionNotice(textToDisplay)
        const timer = setTimeout(() => setActionNotice(null), 2500)
        return () => clearTimeout(timer)
      }
    }
  }, [gameState.logs, currentSocketId])

  // turn chime
  useEffect(() => {
    if (isMyTurn && !prevTurnRef.current && !gameState.winnerId) {
      sounds.playTurnAlert()
    }
    prevTurnRef.current = isMyTurn
  }, [isMyTurn, gameState.winnerId])

  // victory confetti
  useEffect(() => {
    if (gameState.winnerId) {
      sounds.playVictory()
      const canvas = confettiCanvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      canvas.width = window.innerWidth
      canvas.height = window.innerHeight

      const particles: Array<{ x: number; y: number; vx: number; vy: number; color: string; size: number; rot: number; vRot: number }> = []
      const colors = ['#ed1c24', '#0054a6', '#00a651', '#ffde00', '#f59e0b', '#ec4899', '#8b5cf6']
      for (let i = 0; i < 150; i++) {
        particles.push({
          x: canvas.width / 2,
          y: canvas.height * 0.45,
          vx: (Math.random() - 0.5) * 18,
          vy: (Math.random() - 0.7) * 16,
          color: colors[Math.floor(Math.random() * colors.length)],
          size: Math.random() * 9 + 4,
          rot: Math.random() * 360,
          vRot: (Math.random() - 0.5) * 12
        })
      }

      let animId: number
      const render = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        particles.forEach(p => {
          p.x += p.vx
          p.y += p.vy
          p.vy += 0.28
          p.rot += p.vRot
          ctx.save()
          ctx.translate(p.x, p.y)
          ctx.rotate((p.rot * Math.PI) / 180)
          ctx.fillStyle = p.color
          ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6)
          ctx.restore()
        })
        animId = requestAnimationFrame(render)
      }
      render()

      return () => cancelAnimationFrame(animId)
    }
  }, [gameState.winnerId])

  // helper to get active side for playable check
  const getActiveSide = (card: Card) => {
    if (gameState.mode === 'flip') {
      if (gameState.side === 'dark' && card.dark) return card.dark;
      if (gameState.side === 'light' && card.light) return card.light;
    }
    return { color: card.color, value: card.value };
  }

  // check if card is playable
  const checkPlayable = (card: Card): boolean => {
    if (!isMyTurn || gameState.winnerId) return false

    const activeSide = getActiveSide(card);

    // penalty active: only stacking is allowed
    if (gameState.pendingPenaltyType !== null) {
      return activeSide.value === gameState.pendingPenaltyType
    }

    // normal check
    if (activeSide.color === 'wild' || activeSide.value === '+4' || activeSide.value === 'wild' || activeSide.value === 'wild_draw_color') return true
    return activeSide.color === gameState.activeColor || activeSide.value === gameState.activeValue
  }

  // handle card click
  const handleCardClick = (card: Card) => {
    if (isDraggingRef.current) return
    if (!checkPlayable(card)) return

    const activeSide = getActiveSide(card);

    // wild cards require color selection
    if (activeSide.color === 'wild' || activeSide.value === 'wild' || activeSide.value === '+4' || activeSide.value === 'wild_draw_color') {
      setSelectedWildCard(card)
      setShowColorPicker(true)
      return
    }

    sounds.playCardSnap()
    socket?.emit('play-card', {
      roomId,
      cardId: card.id
    })
  }

  // card hover sound
  const handleCardHover = (playable: boolean) => {
    if (playable) {
      sounds.playCardHover()
    }
  }

  // select wild color
  const handleColorSelect = (color: ColorChoice) => {
    if (!selectedWildCard) return

    sounds.playColorSelect()
    socket?.emit('play-card', {
      roomId,
      cardId: selectedWildCard.id,
      chosenColor: color
    })

    setShowColorPicker(false)
    setSelectedWildCard(null)
  }

  // draw card / take penalty / pass if already drawn
  const handleDrawCard = () => {
    if (!isMyTurn || gameState.winnerId) return

    if (canPassOrSkip) {
      sounds.playDraw()
      socket?.emit('pass-turn', { roomId })
      return
    }

    sounds.playDraw()
    socket?.emit('draw-card', { roomId })
  }

  // pass turn after drawing
  const handlePassTurn = () => {
    if (!isMyTurn || gameState.winnerId) return
    sounds.playDraw()
    socket?.emit('pass-turn', { roomId })
  }

  // call uno
  const handleCallUno = () => {
    sounds.playUnoCall()
    socket?.emit('call-uno', { roomId })
  }

  // restart game
  const handleRestart = () => {
    socket?.emit('restart-game', { roomId })
  }

  // back to lobby
  const handleBackToLobby = () => {
    socket?.emit('back-to-lobby', { roomId })
  }

  // toggle mute
  const toggleSound = () => {
    const muted = sounds.toggleMute()
    setIsMuted(muted)
  }

  // leave room
  const handleLeaveRoom = () => {
    if (!gameState.winnerId) {
      const confirmLeave = window.confirm('Are you sure you want to leave the game?')
      if (!confirmLeave) return
    }
    if (onLeaveRoom) {
      onLeaveRoom()
    }
  }

  const winner = players.find(p => p.id === gameState.winnerId)
  const isMeWinner = winner?.id === currentSocketId
  const canCallUno = (myHand.length === 1 || myHand.length === 2) && !gameState.unoCalls[currentSocketId]

  const isDarkSide = gameState.mode === 'flip' && gameState.side === 'dark'

  return (
    <div className={`game-board-arena arena-theme-${gameState.activeColor} ${isDarkSide ? 'theme-dark theme-dark-flip' : 'theme-light'}`}>
      {/* victory confetti */}
      {winner && <canvas ref={confettiCanvasRef} className="confetti-canvas" />}

      {/* Floating Dynamic Flying Cards Layer */}
      {flyingCards.length > 0 && (
        <div className="flying-cards-container">
          {flyingCards.map(card => (
            <div
              key={card.id}
              className={`flying-card-wrapper ${card.isDark ? 'flying-card-dark' : 'flying-card-light'}`}
              style={{
                '--start-x': `${card.startX}px`,
                '--start-y': `${card.startY}px`,
                '--delta-x': `${card.deltaX}px`,
                '--delta-y': `${card.deltaY}px`,
                '--arc-offset': `${card.arcOffset}px`,
                '--rot-end': `${card.rotation}deg`,
                '--fly-delay': `${card.delayMs}ms`,
              } as React.CSSProperties}
            >
              <div className="flying-card-inner">
                <div className="flying-card-oval">
                  <span className="flying-card-text">{card.isDark ? 'FLIP' : 'UNO'}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Top Header Bar with Room, Sound & Live Ping */}
      <header className="game-top-bar">
        <div className="top-left-badges">
          <div className="room-title-tag">
            <span className="room-badge-indicator">ROOM</span>
            <span className="room-code-badge">{roomId}</span>
          </div>
          {isSpectator && (
            <div className="spectator-top-pill">
              <span className="spectator-live-dot">●</span> 👁️ SPECTATING
            </div>
          )}
          <button className="sound-toggle-btn" onClick={toggleSound} title={isMuted ? 'Unmute' : 'Mute'}>
            {isMuted ? '🔇 Muted' : '🔊 Sound'}
          </button>
        </div>

        <div className="top-right-actions">
          {myPing !== null && (
            <div className={`ping-badge ${myPing < 100 ? 'ping-good' : myPing < 250 ? 'ping-medium' : 'ping-poor'}`}>
              <span className="ping-dot">●</span> {myPing} ms
            </div>
          )}
          <button className="btn-leave-game" onClick={handleLeaveRoom} title="Leave Room">
            🚪 Leave Room
          </button>
        </div>
      </header>

      {/* Spectator notice toast */}
      {isSpectator && (
        <div className="spectator-sub-banner">
          <span>👁️ You joined while a game is active. Enjoy the match — you'll join the lobby / next round!</span>
        </div>
      )}

      {/* Floating Action Notice Toast */}
      {actionNotice && (
        <div className="action-notice-toast">
          <span className="toast-sparkle">✦</span>
          <span>{actionNotice}</span>
        </div>
      )}

      {/* Winner Celebration Modal */}
      {winner && (
        <div className="modal-overlay">
          <div className="modal winner-modal">
            <div className="trophy-icon">🏆</div>
            <h2>{isMeWinner ? 'VICTORY!' : `${winner.name} Wins!`}</h2>
            <p className="winner-subtext">
              {isMeWinner ? 'Masterful play! You played all your cards first!' : `${winner.name} dominated the table.`}
            </p>

            {/* end game player cards summary */}
            <div className="end-game-scoreboard">
              <h4>Final Standings</h4>
              <div className="end-game-player-list">
                {players
                  .slice()
                  .sort((a, b) => {
                    const aCount = (gameState.hands[a.id] || []).length
                    const bCount = (gameState.hands[b.id] || []).length
                    return aCount - bCount
                  })
                  .map((p) => {
                    const cardCount = (gameState.hands[p.id] || []).length
                    const isWinner = p.id === gameState.winnerId || cardCount === 0
                    const isMe = p.id === currentSocketId

                    return (
                      <div key={p.id} className={`end-game-player-item ${isWinner ? 'winner-item' : ''}`}>
                        <div className="end-game-player-left">
                          <span className="end-game-avatar">
                            {p.name.slice(0, 2).toUpperCase()}
                          </span>
                          <span className="end-game-name">
                            {isMe ? `${p.name} (You)` : p.name}
                          </span>
                          {p.isSpectator && (
                            <span className="spectator-mini-tag">👁️ Spectator</span>
                          )}
                          {(p.wins || 0) > 0 && (
                            <span className="player-wins-badge" title={`${p.wins} wins in this room`}>
                              🏆 {p.wins}
                            </span>
                          )}
                        </div>
                        <div className="end-game-card-count">
                          {p.isSpectator ? (
                            <span className="ended-cards-pill">Spectating</span>
                          ) : isWinner ? (
                            <span className="winner-tag-pill">👑 0 cards (Winner)</span>
                          ) : (
                            <span className="ended-cards-pill">
                              Ended with {cardCount} {cardCount === 1 ? 'card' : 'cards'}
                            </span>
                          )}
                        </div>
                      </div>
                    )
                  })}
              </div>
            </div>

            {isHost ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', width: '100%' }}>
                <button className="btn btn-play btn-glow" onClick={handleRestart}>
                  ▶ Play Another Round
                </button>
                <button className="btn btn-secondary" onClick={handleBackToLobby}>
                  🏠 Return to Lobby
                </button>
              </div>
            ) : (
              <p className="waiting-pill">Waiting for host to start next round...</p>
            )}
            <button className="btn btn-secondary" onClick={handleLeaveRoom} style={{ marginTop: '0.75rem', width: '100%' }}>
              🚪 Leave Room
            </button>
          </div>
        </div>
      )}

      {/* Jewel Color Picker Modal for Wild / +4 */}
      {showColorPicker && (
        <div className="modal-overlay">
          <div className="modal color-picker-modal">
            <div className="color-picker-header">
              <span className="color-picker-icon">🌈</span>
              <h3>Choose Wild Color</h3>
              <p className="color-picker-subtitle">Select the color to dictate the next turn</p>
            </div>
            <div className="color-grid">
              {gameState.mode === 'flip' && gameState.side === 'dark' ? (
                <>
                  <button className="color-btn gem-teal" onClick={() => handleColorSelect('teal')}>
                    <span className="color-gem-label">Neon Teal</span>
                  </button>
                  <button className="color-btn gem-orange" onClick={() => handleColorSelect('orange')}>
                    <span className="color-gem-label">Neon Orange</span>
                  </button>
                  <button className="color-btn gem-pink" onClick={() => handleColorSelect('pink')}>
                    <span className="color-gem-label">Neon Pink</span>
                  </button>
                  <button className="color-btn gem-purple" onClick={() => handleColorSelect('purple')}>
                    <span className="color-gem-label">Neon Purple</span>
                  </button>
                </>
              ) : (
                <>
                  <button className="color-btn gem-red" onClick={() => handleColorSelect('red')}>
                    <span className="color-gem-label">Ruby Red</span>
                  </button>
                  <button className="color-btn gem-blue" onClick={() => handleColorSelect('blue')}>
                    <span className="color-gem-label">Sapphire Blue</span>
                  </button>
                  <button className="color-btn gem-green" onClick={() => handleColorSelect('green')}>
                    <span className="color-gem-label">Emerald Green</span>
                  </button>
                  <button className="color-btn gem-yellow" onClick={() => handleColorSelect('yellow')}>
                    <span className="color-gem-label">Amber Gold</span>
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Turn sequence track */}
      <section className="turn-sequence-bar">
        <div className="turn-sequence-track">
          {activePlayers.map((player, idx) => {
            const isPlayerTurn = idx === gameState.currentTurnIndex
            const isMe = player.id === currentSocketId
            const pHand = gameState.hands[player.id] || []
            const calledUno = gameState.unoCalls[player.id]
            const isOnline = player.isOnline !== false
            const isClockwise = gameState.direction === 1
            const arrowChar = isClockwise ? '➔' : '⬅'
            const impact = playerImpacts[player.id]
            const isImpacted = Boolean(impact)

            return (
              <div key={player.id} className="turn-node-group">
                <div 
                  id={`player-turn-node-${player.id}`}
                  className={`turn-player-box ${isPlayerTurn ? 'turn-active' : ''} ${isMe ? 'is-self' : ''} ${!isOnline ? 'is-offline' : ''} ${isImpacted ? 'draw-impact-pulse' : ''}`}
                  title={`${player.name} (${pHand.length} cards)`}
                >
                  {isImpacted && (
                    <div className="draw-count-badge-float">
                      +{impact?.count}
                    </div>
                  )}
                  <span className="player-mini-avatar">
                    {player.name.slice(0, 2).toUpperCase()}
                  </span>
                  <span className="player-mini-name">
                    {isMe ? 'You' : player.name}
                  </span>
                  {(player.wins || 0) > 0 && (
                    <span className="mini-wins-pill" title={`${player.wins} wins in this room`}>
                      🏆{player.wins}
                    </span>
                  )}
                  <span className={`player-mini-cards ${isImpacted ? 'cards-bump' : ''}`}>
                    {pHand.length}
                  </span>
                  {calledUno && <span className="mini-uno-pill">UNO</span>}
                  {isPlayerTurn && (
                    <span className={`mini-timer-pill ${timeLeft <= 5 ? 'timer-urgent' : ''}`}>
                      {timeLeft}s
                    </span>
                  )}
                  {player.isHost && <span className="mini-host-crown">👑</span>}
                </div>

                {activePlayers.length > 1 && (
                  <span className={`turn-arrow-indicator ${isPlayerTurn ? 'arrow-highlight' : ''}`}>
                    {idx < activePlayers.length - 1 ? arrowChar : (activePlayers.length > 2 ? (isClockwise ? '↺' : '↻') : '')}
                  </span>
                )}
              </div>
            )
          })}

          {spectatorPlayers.length > 0 && (
            <div className="spectator-count-badge" title={spectatorPlayers.map(s => s.name).join(', ')}>
              👁️ {spectatorPlayers.length} {spectatorPlayers.length === 1 ? 'Spectator' : 'Spectators'}
            </div>
          )}
        </div>
      </section>

      {/* Central Casino Felt Stadium Arena */}
      <section className="stadium-table">
        <div className="table-felt-glow" />
        <div className="table-border-ring" />

        {/* Orbit direction ring with glowing arrows */}
        <div className={`orbit-direction ${gameState.direction === 1 ? 'clockwise' : 'counter-clockwise'}`}>
          <div className="orbit-arrow arrow-1">▶</div>
          <div className="orbit-arrow arrow-2">▶</div>
        </div>

        {/* Center Arena HUD: Active Color & Direction */}
        <div className="arena-hud-bar">
          <div className={`active-color-pill color-glow-${gameState.activeColor}`}>
            <span className="color-swatch" />
            <span className="active-label">Active:</span>
            <strong className="active-value-text">{gameState.activeColor.toUpperCase()}</strong>
          </div>
          <div className="direction-pill">
            {gameState.direction === 1 ? '↻ Clockwise' : '↺ Counter-Clockwise'}
          </div>
        </div>

        {/* Penalty Stacking Warning Banner */}
        {gameState.pendingPenaltyType && (
          <div className="penalty-flame-banner">
            <span className="flame-icon">🔥</span>
            <span>
              <strong>{gameState.pendingPenaltyType} Chain:</strong>{' '}
              {gameState.pendingPenaltyType === 'wild_draw_color'
                ? 'Stack wild_draw_color or draw until matching color.'
                : `Stack ${gameState.pendingPenaltyType} or draw +${gameState.accumulatedPenalty} cards.`}
            </span>
          </div>
        )}

        {/* Playable Draw Notification */}
        {canPassOrSkip && (
          <div className="drawn-playable-alert">
            <span>✨ You can play a valid card, or click Skip / Pass to end your turn.</span>
            <button className="btn-pass-glow" onClick={handlePassTurn}>
              ✋ Skip / Pass Turn
            </button>
          </div>
        )}

        {/* Center Card Piles Desk */}
        <div className="center-piles-desk">
          {/* Realistic 3D Stack Draw Pile */}
          <div 
            id="draw-pile-source"
            className={`pile-realistic-stack draw-pile-group ${isMyTurn ? 'interactive-draw' : ''}`} 
            onClick={handleDrawCard}
            title={isMyTurn ? (canPassOrSkip ? 'Click to Skip / Pass Turn' : 'Click to Draw Card') : 'Draw Deck'}
          >
            <UnoCard
              card={{ id: 'draw-pile', color: 'red', value: '0' }}
              isDrawPile={true}
              isPlayable={isMyTurn}
              side={gameState.mode === 'flip' && gameState.side === 'light' ? 'dark' : 'light'}
            />
            <div className={`pile-label-badge ${isMyTurn ? 'badge-my-turn' : ''}`}>
              {isSpectator 
                ? 'Draw Deck'
                : gameState.pendingPenaltyType 
                ? (gameState.pendingPenaltyType === 'wild_draw_color' ? 'Draw Until Color' : `Take +${gameState.accumulatedPenalty}`) 
                : canPassOrSkip ? 'Skip / Pass' : isMyTurn ? 'Tap to Draw' : 'Draw Deck'}
            </div>
          </div>

          {/* Discard Pile with ambient spotlight and organic rotation */}
          {topDiscard && (
            <div className="pile-realistic-stack discard-pile-group">
              <div className={`discard-ambient-ring glow-${gameState.activeColor}`} />
              <UnoCard 
                card={topDiscard} 
                rotation={-4} 
                side={gameState.side} 
                overrideColor={gameState.activeColor !== 'wild' ? gameState.activeColor : undefined}
              />
              <div className="pile-label-badge">
                Discard Pile
              </div>
            </div>
          )}
        </div>

        {/* Esports Turn Spotlight Banner */}
        <div className={`turn-spotlight ${isMyTurn ? 'my-turn-spotlight' : ''}`}>
          <div className={`spotlight-timer-chip ${timeLeft <= 5 ? 'timer-urgent' : ''}`}>
            <span className="timer-icon">⏱️</span>
            <span className="timer-num">{timeLeft}s</span>
          </div>
          <span>
            {isSpectator 
              ? `👁️ Watching ${currentTurnPlayer?.name || 'players'}'s turn`
              : isMyTurn 
              ? (canPassOrSkip ? '👉 Play from your hand or click Skip / Pass' : '⚡ YOUR TURN — Play a matching card or draw!')
              : `Waiting for ${currentTurnPlayer?.name || 'player'}...`}
          </span>
        </div>
      </section>

      {/* Floating Action Controls & Shimmering CALL UNO Button */}
      {!isSpectator && (
        <div className="interactive-controls-bar">
          {canPassOrSkip && (
            <button className="btn btn-secondary btn-glow" onClick={handlePassTurn}>
              ✋ Skip / Pass Turn
            </button>
          )}

          {canCallUno && (
            <button className="uno-flame-btn" onClick={handleCallUno}>
              <span className="uno-flame-sparkle">🔥</span>
              <span>CALL UNO!</span>
            </button>
          )}
        </div>
      )}

      {/* Player Hand or Spectator Dock */}
      {isSpectator ? (
        <footer className="spectator-bottom-dock">
          <div className="spectator-dock-card">
            <span className="spectator-badge-pill">👁️ SPECTATING MATCH</span>
            <p>You joined while a match is in progress. Watch the table play out — you will automatically enter the lobby / join the next round!</p>
          </div>
        </footer>
      ) : (
        <footer className="player-hand-dock">
          <div className="dock-header">
            <div className="dock-title">
              <span>Your Hand</span>
              <span className="cards-count-badge">{myHand.length} cards</span>
            </div>
            {gameState.mode === 'flip' && (
              <button 
                className={`btn-peek-flip ${isHandFlipped ? 'peek-active' : ''}`}
                onClick={() => setIsHandFlipped(!isHandFlipped)}
                title="Flip hand over to peek at the other side"
              >
                <span>↺</span>
                <span>{isHandFlipped ? 'Showing Flip Side' : 'Peek Flip Side'}</span>
              </button>
            )}
            {gameState.unoCalls[currentSocketId] && (
              <span className="uno-active-badge">✦ UNO SAFE</span>
            )}
          </div>

          <div 
            ref={fanContainerRef}
            className={`cards-fan-container ${isGrabbing ? 'is-grabbing' : ''}`}
            onMouseDown={handleMouseDown}
            onWheel={(e) => {
              if (e.deltaY !== 0) {
                e.currentTarget.scrollLeft += e.deltaY
              }
            }}
          >
            {myHand.map((card, idx) => {
              const playable = checkPlayable(card)
              const isJustDrawn = card.id === gameState.drawnCardId
              const total = myHand.length

              // fan curve
              const centerIdx = (total - 1) / 2
              const offset = idx - centerIdx
              const maxRot = total > 10 ? 10 : 16
              const rotStep = total > 10 ? 1.2 : 2.2
              const rotation = total > 3 ? Math.max(-maxRot, Math.min(maxRot, offset * rotStep)) : 0
              const translateY = Math.min(12, Math.abs(offset) * (total > 10 ? 1.2 : 2.0))

              return (
                <div 
                  key={card.id} 
                  className={`fanned-card-slot ${playable ? 'slot-playable' : 'slot-unplayable'}`}
                  style={{ 
                    transform: `translateY(${translateY}px) rotate(${rotation}deg)`,
                    zIndex: idx + 1
                  }}
                >
                  {isJustDrawn && <span className="just-drawn-chip">NEW</span>}
                  <UnoCard
                    card={card}
                    isPlayable={playable}
                    onClick={() => handleCardClick(card)}
                    onMouseEnter={() => handleCardHover(playable)}
                    side={gameState.side}
                    isHandFlipped={isHandFlipped}
                  />
                </div>
              )
            })}
          </div>
        </footer>
      )}
    </div>
  )
}
