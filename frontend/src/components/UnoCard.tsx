export interface Card {
  id: string
  color: 'red' | 'blue' | 'green' | 'yellow' | 'wild'
  value: '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'skip' | 'reverse' | '+2' | 'wild' | '+4'
}

interface UnoCardProps {
  card: Card
  isPlayable?: boolean
  onClick?: () => void
  onMouseEnter?: () => void
  isDrawPile?: boolean
  isSmall?: boolean
  rotation?: number
}

export default function UnoCard({
  card,
  isPlayable = false,
  onClick,
  onMouseEnter,
  isDrawPile = false,
  isSmall = false,
  rotation = 0
}: UnoCardProps) {
  // draw pile card back
  if (isDrawPile) {
    return (
      <div 
        className={`uno-card-realistic uno-card-back ${isPlayable ? 'playable-deck' : ''} ${isSmall ? 'small' : ''}`}
        onClick={onClick}
        onMouseEnter={onMouseEnter}
        style={{ transform: rotation ? `rotate(${rotation}deg)` : undefined }}
      >
        <div className="card-outer-rim">
          <div className="card-face-back">
            <div className="card-back-pattern" />
            <div className="card-back-oval">
              <span className="card-back-text">UNO</span>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // render central icon or number
  const renderContent = (val: string) => {
    switch (val) {
      case 'skip':
        return (
          <svg viewBox="0 0 24 24" className="card-svg-icon" fill="none" stroke="currentColor" strokeWidth="3">
            <circle cx="12" cy="12" r="8.5" />
            <line x1="5.5" y1="5.5" x2="18.5" y2="18.5" />
          </svg>
        )
      case 'reverse':
        return (
          <svg viewBox="0 0 24 24" className="card-svg-icon" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 9h12a4 4 0 0 1 4 4" />
            <path d="M8 5L4 9l4 4" />
            <path d="M20 15H8a4 4 0 0 1-4-4" />
            <path d="M16 19l4-4-4-4" />
          </svg>
        )
      case '+2':
        return <span className="card-action-text">+2</span>
      case '+4':
        return (
          <div className="wild-four-cluster">
            <div className="mini-card-fan fan-red" />
            <div className="mini-card-fan fan-blue" />
            <div className="mini-card-fan fan-yellow" />
            <div className="mini-card-fan fan-green" />
            <span className="wild-four-badge">+4</span>
          </div>
        )
      case 'wild':
        return (
          <div className="wild-disc-container">
            <div className="wild-quad-circle">
              <div className="quad q-red" />
              <div className="quad q-blue" />
              <div className="quad q-yellow" />
              <div className="quad q-green" />
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

  // render corner marks
  const renderCorner = (val: string) => {
    switch (val) {
      case 'skip':
        return '⊘'
      case 'reverse':
        return '⇄'
      case 'wild':
        return 'W'
      case '+4':
        return '+4'
      case '6':
        return <span className="under-line">6</span>
      case '9':
        return <span className="under-line">9</span>
      default:
        return val
    }
  }

  return (
    <div 
      className={`uno-card-realistic card-color-${card.color} ${isPlayable ? 'playable' : ''} ${isSmall ? 'small' : ''}`}
      onClick={isPlayable ? onClick : undefined}
      onMouseEnter={onMouseEnter}
      style={{ transform: rotation ? `rotate(${rotation}deg)` : undefined }}
    >
      <div className="card-outer-rim">
        <div className="card-face">
          {/* top corner */}
          <div className="card-corner corner-tl">
            <span>{renderCorner(card.value)}</span>
          </div>

          {/* central oval */}
          <div className="card-oval-container">
            <div className="card-oval">
              <div className="card-oval-content">
                {renderContent(card.value)}
              </div>
            </div>
          </div>

          {/* bottom corner */}
          <div className="card-corner corner-br">
            <span>{renderCorner(card.value)}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
