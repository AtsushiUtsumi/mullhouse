import { SUIT_SYMBOLS } from '../utils/hands'

interface PlayingCardProps {
  card: string
}

const RED_SUITS = new Set(['h', 'd'])

export function PlayingCard({ card }: PlayingCardProps) {
  const rank = card[0]?.toUpperCase()
  const suit = card[1]?.toLowerCase()
  const isRed = RED_SUITS.has(suit)

  return (
    <div className={`playing-card ${isRed ? 'red' : 'black'}`}>
      <span className="playing-card-rank">{rank}</span>
      <span className="playing-card-suit">{SUIT_SYMBOLS[suit] ?? suit}</span>
    </div>
  )
}

interface BoardCardsProps {
  cards: string[]
  street: string
  action?: string
}

export function BoardCards({ cards, street, action }: BoardCardsProps) {
  if (street === 'preflop') return null

  return (
    <div className="board-cards">
      <span className="board-cards-label">ボード（{street}）</span>
      <div className="board-cards-row">
        {cards.map((card, i) => (
          <PlayingCard key={`${card}-${i}`} card={card} />
        ))}
        {action && <span className="board-cards-action">{action}</span>}
      </div>
    </div>
  )
}
