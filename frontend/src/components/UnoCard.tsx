import { memo } from 'react'

export interface Card {
  id: string
  color: 'red' | 'blue' | 'green' | 'yellow' | 'orange' | 'pink' | 'teal' | 'purple' | 'wild'
  value: '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'skip' | 'reverse' | '+2' | 'wild' | '+4' | 'flip' | '+5' | 'skip_everyone' | 'wild_draw_color'
  light?: { color: string; value: string }
  dark?: { color: string; value: string }
}

export interface UnoCardProps {
  card: Card
  isPlayable?: boolean
  onClick?: () => void
  onMouseEnter?: () => void
  isDrawPile?: boolean
  isSmall?: boolean
  rotation?: number
  side?: 'light' | 'dark'
  isHandFlipped?: boolean
}

function UnoCard({
  card,
  isPlayable = false,
  onClick,
  onMouseEnter,
  isDrawPile = false,
  isSmall = false,
  rotation = 0,
  side = 'light',
  isHandFlipped = false
}: UnoCardProps) {
  // determine active side
  const effectiveSide: 'light' | 'dark' = isHandFlipped 
    ? (side === 'dark' ? 'light' : 'dark') 
    : side

  const activeProps = effectiveSide === 'dark' && card.dark
    ? card.dark
    : (card.light || { color: card.color, value: card.value })

  const activeColor = activeProps.color
  const activeValue = activeProps.value

  // draw pile card back
  if (isDrawPile) {
    const isDarkPile = side === 'dark'
    return (
      <div 
        className={`uno-card-realistic uno-card-back ${isDarkPile ? 'card-side-dark back-dark' : 'card-side-light back-light'} ${isPlayable ? 'playable-deck' : ''} ${isSmall ? 'small' : ''}`}
        onClick={onClick}
        onMouseEnter={onMouseEnter}
        style={{ transform: rotation ? `rotate(${rotation}deg)` : undefined }}
      >
        <div className="card-outer-rim">
          <div className="card-face-back">
            <div className="card-back-pattern" />
            <div className="card-sheen-gloss" />
            <div className={`card-back-oval ${isDarkPile ? 'oval-dark' : 'oval-light'}`}>
              <span className={`card-back-text ${isDarkPile ? 'text-dark' : 'text-light'}`}>
                {isDarkPile ? 'UNO FLIP' : 'UNO'}
              </span>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // corner symbol
  const renderCorner = (val: string) => {
    switch (val) {
      case 'skip':
        return '⊘'
      case 'reverse':
        return '⇄'
      case 'flip':
        return <span className="corner-flip-badge">FLIP</span>
      case 'wild':
        return 'W'
      case '+4':
        return '+4'
      case '+2':
        return '+2'
      case '6':
        return <span className="under-line">6</span>
      case '9':
        return <span className="under-line">9</span>
      default:
        return val
    }
  }

  // center content
  const renderContent = (val: string, curSide: 'light' | 'dark') => {
    switch (val) {
      case 'skip':
        return (
          <svg viewBox="0 0 28 28" className="card-svg-icon skip-svg" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round">
            <circle cx="14" cy="14" r="10" />
            <line x1="6.5" y1="6.5" x2="21.5" y2="21.5" />
          </svg>
        )
      case 'reverse':
        return (
          <svg viewBox="0 0 32 32" className="card-svg-icon reverse-svg" fill="currentColor">
            <path d="M7 11h13a4 4 0 0 1 4 4v1h-3v-1a1.5 1.5 0 0 0-1.5-1.5H7v3.5L2 12.5 7 8v3z" />
            <path d="M25 21H12a4 4 0 0 1-4-4v-1h3v1a1.5 1.5 0 0 0 1.5 1.5H25v-3.5l5 4.5-5 4.5v-3z" />
          </svg>
        )
      case 'flip':
        return (
          <div className="card-flip-content">
            <svg viewBox="0 0 32 32" className="card-svg-icon flip-svg" fill="currentColor">
              <path d="M12 6h8a2 2 0 0 1 2 2v5h-3V9h-7v3l-5-4 5-4v2z" />
              <path d="M20 26h-8a2 2 0 0 1-2-2v-5h3v4h7v-3l5 4-5 4v-2z" />
              <rect x="10" y="10" width="6" height="8" rx="1" fill="none" stroke="currentColor" strokeWidth="1.6" />
              <rect x="16" y="14" width="6" height="8" rx="1" fill="none" stroke="currentColor" strokeWidth="1.6" />
            </svg>
            <span className="card-flip-text">FLIP</span>
          </div>
        )
      case '+2':
        return <span className="card-action-text">+2</span>
      case '+5':
        return <span className="card-action-text">+5</span>
      case 'skip_everyone':
        return (
          <div className="card-flip-content">
            <svg viewBox="0 0 32 32" className="card-svg-icon skip-all-svg" fill="currentColor">
              <circle cx="16" cy="16" r="10" fill="none" stroke="currentColor" strokeWidth="2.5" />
              <line x1="8.5" y1="8.5" x2="23.5" y2="23.5" stroke="currentColor" strokeWidth="2.5" />
              <circle cx="16" cy="16" r="13" fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="4 2" />
            </svg>
            <span className="card-flip-text" style={{fontSize: '0.6em', marginTop: '2px'}}>SKIP ALL</span>
          </div>
        )
      case '+4':
        return (
          <div className={`wild-four-cluster cluster-${curSide}`}>
            {curSide === 'dark' ? (
              <>
                <div className="mini-card-fan fan-teal" />
                <div className="mini-card-fan fan-orange" />
                <div className="mini-card-fan fan-pink" />
                <div className="mini-card-fan fan-purple" />
              </>
            ) : (
              <>
                <div className="mini-card-fan fan-red" />
                <div className="mini-card-fan fan-blue" />
                <div className="mini-card-fan fan-yellow" />
                <div className="mini-card-fan fan-green" />
              </>
            )}
            <span className="wild-four-badge">+4</span>
          </div>
        )
      case 'wild_draw_color':
        return (
          <div className="wild-disc-container">
            <div className={`wild-quad-circle quad-${curSide}`}>
              {curSide === 'dark' ? (
                <>
                  <div className="quad q-teal" />
                  <div className="quad q-orange" />
                  <div className="quad q-pink" />
                  <div className="quad q-purple" />
                </>
              ) : (
                <>
                  <div className="quad q-red" />
                  <div className="quad q-blue" />
                  <div className="quad q-yellow" />
                  <div className="quad q-green" />
                </>
              )}
            </div>
            <span className="wild-disc-text" style={{fontSize: '0.8em'}}>WILD</span>
            <span className="wild-disc-text" style={{fontSize: '0.5em', marginTop: '-2px'}}>DRAW COLOR</span>
          </div>
        )
      case 'wild':
        return (
          <div className="wild-disc-container">
            <div className={`wild-quad-circle quad-${curSide}`}>
              {curSide === 'dark' ? (
                <>
                  <div className="quad q-teal" />
                  <div className="quad q-orange" />
                  <div className="quad q-pink" />
                  <div className="quad q-purple" />
                </>
              ) : (
                <>
                  <div className="quad q-red" />
                  <div className="quad q-blue" />
                  <div className="quad q-yellow" />
                  <div className="quad q-green" />
                </>
              )}
            </div>
            <span className="wild-disc-text">WILD</span>
          </div>
        )
      case '6':
        return <span className="card-num-text under-line">6</span>
      case '9':
        return <span className="card-num-text under-line">9</span>
      default:
        return <span className="card-num-text">{val}</span>
    }
  }

  return (
    <div 
      className={`uno-card-realistic card-side-${effectiveSide} card-color-${activeColor} ${isPlayable ? 'playable' : ''} ${isSmall ? 'small' : ''}`}
      onClick={isPlayable ? onClick : undefined}
      onMouseEnter={onMouseEnter}
      style={{ transform: rotation ? `rotate(${rotation}deg)` : undefined }}
    >
      <div className="card-outer-rim">
        <div className="card-face">
          {/* card sheen reflection */}
          <div className="card-sheen-gloss" />

          {/* top-left corner */}
          <div className="card-corner corner-tl">
            <span>{renderCorner(activeValue)}</span>
          </div>

          {/* flip peek tab removed as per user request */}

          {/* center oval */}
          <div className="card-oval-container">
            <div className={`card-oval ${effectiveSide === 'dark' ? 'oval-dark' : 'oval-light'}`}>
              <div className="card-oval-content">
                {renderContent(activeValue, effectiveSide)}
              </div>
            </div>
          </div>

          {/* bottom-right corner */}
          <div className="card-corner corner-br">
            <span>{renderCorner(activeValue)}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default memo(UnoCard)
