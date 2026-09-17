export type CardColor = 'red' | 'blue' | 'green' | 'yellow' | 'orange' | 'pink' | 'teal' | 'purple' | 'wild';
export type CardValue = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'skip' | 'reverse' | '+2' | 'wild' | '+4' | 'flip' | '+5' | 'skip_everyone' | 'wild_draw_color';

export interface Card {
  id: string;
  color: CardColor;
  value: CardValue;
  light?: { color: CardColor; value: CardValue };
  dark?: { color: CardColor; value: CardValue };
}

export interface GameLog {
  id: string;
  text: string;
  time: number;
}

export interface GameState {
  mode: 'normal' | 'flip';
  side: 'light' | 'dark';
  deck: Card[];
  discardPile: Card[];
  hands: Record<string, Card[]>; // playerId -> cards
  currentTurnIndex: number;
  direction: 1 | -1;
  activeColor: CardColor;
  activeValue: string;
  accumulatedPenalty: number;
  pendingPenaltyType: '+2' | '+4' | '+5' | 'wild_draw_color' | null;
  pendingDrawColor?: CardColor | null;
  drawnCardId: string | null;
  canPassTurn: boolean;
  unoCalls: Record<string, boolean>;
  winnerId: string | null;
  logs: GameLog[];
}

const COLORS: Array<'red' | 'blue' | 'green' | 'yellow'> = ['red', 'blue', 'green', 'yellow'];
const DARK_COLORS: Array<'orange' | 'pink' | 'teal' | 'purple'> = ['orange', 'pink', 'teal', 'purple'];

// create full uno deck
export function createDeck(mode: 'normal' | 'flip' = 'normal'): Card[] {
  const deck: Card[] = [];
  let cardId = 0;

  for (const color of COLORS) {
    // 0 card
    deck.push({ id: `card_${cardId++}`, color, value: '0' });

    // 1-9 cards (2 of each)
    for (let num = 1; num <= 9; num++) {
      const val = num.toString() as CardValue;
      deck.push({ id: `card_${cardId++}`, color, value: val });
      deck.push({ id: `card_${cardId++}`, color, value: val });
    }

    // action cards (2 of each)
    const actions: CardValue[] = ['skip', 'reverse', '+2'];
    for (const act of actions) {
      deck.push({ id: `card_${cardId++}`, color, value: act });
      deck.push({ id: `card_${cardId++}`, color, value: act });
    }
  }

  // wild cards (4 regular wild, 4 wild +4)
  for (let i = 0; i < 4; i++) {
    deck.push({ id: `card_${cardId++}`, color: 'wild', value: 'wild' });
    deck.push({ id: `card_${cardId++}`, color: 'wild', value: '+4' });
  }

  // If flip mode, we need to add light/dark properties and add flip cards.
  if (mode === 'flip') {
    // Add flip cards to the light side deck
    for (const color of COLORS) {
      deck.push({ id: `card_${cardId++}`, color, value: 'flip' });
      deck.push({ id: `card_${cardId++}`, color, value: 'flip' });
    }

    // Generate dark deck equivalent
    const darkDeck: Array<{color: CardColor, value: CardValue}> = [];
    for (const dColor of DARK_COLORS) {
      darkDeck.push({ color: dColor, value: '0' });
      for (let num = 1; num <= 9; num++) {
        const val = num.toString() as CardValue;
        darkDeck.push({ color: dColor, value: val });
        darkDeck.push({ color: dColor, value: val });
      }
      const actions: CardValue[] = ['skip_everyone', 'reverse', '+5', 'flip'];
      for (const act of actions) {
        darkDeck.push({ color: dColor, value: act });
        darkDeck.push({ color: dColor, value: act });
      }
    }
    for (let i = 0; i < 4; i++) {
      darkDeck.push({ color: 'wild', value: 'wild' });
      darkDeck.push({ color: 'wild', value: 'wild_draw_color' });
    }

    // Shuffle dark deck to assign randomly to light cards
    const shuffledDark = shuffle(darkDeck);
    
    // Assign light and dark properties
    for (let i = 0; i < deck.length; i++) {
      const c = deck[i];
      c.light = { color: c.color, value: c.value };
      // if dark deck runs out, just fallback to light (should not happen if lengths match)
      const d = shuffledDark[i] || { color: 'wild', value: 'wild' };
      c.dark = { color: d.color, value: d.value };
    }
  }

  // shuffle deck
  return shuffle(deck);
}

// shuffle array
export function shuffle<T>(array: T[]): T[] {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// initialize new game
export function initializeGame(playerIds: string[], mode: 'normal' | 'flip' = 'normal'): GameState {
  let deck = createDeck(mode);
  const hands: Record<string, Card[]> = {};

  // deal 7 cards each
  for (const pid of playerIds) {
    hands[pid] = deck.splice(0, 7);
  }

  // initial discard card (pick first non-wild card if possible)
  let initialCardIndex = deck.findIndex(c => c.color !== 'wild' && c.value !== '+2' && c.value !== 'skip' && c.value !== 'reverse');
  if (initialCardIndex === -1) initialCardIndex = 0;
  const [startCard] = deck.splice(initialCardIndex, 1);

  const initialColor = (startCard.color === 'wild' ? COLORS[Math.floor(Math.random() * COLORS.length)] : startCard.color) as CardColor;

  return {
    mode,
    side: 'light',
    deck,
    discardPile: [startCard],
    hands,
    currentTurnIndex: 0,
    direction: 1,
    activeColor: initialColor,
    activeValue: startCard.value,
    accumulatedPenalty: 0,
    pendingPenaltyType: null,
    drawnCardId: null,
    canPassTurn: false,
    unoCalls: {},
    winnerId: null,
    logs: [
      { id: Math.random().toString(), text: 'Game started! Top card is ' + initialColor.toUpperCase() + ' ' + startCard.value, time: Date.now() }
    ]
  };
}

// draw cards from deck (reshuffles if low)
function drawFromDeck(gameState: GameState, count: number): Card[] {
  const drawn: Card[] = [];

  for (let i = 0; i < count; i++) {
    if (gameState.deck.length === 0) {
      if (gameState.discardPile.length <= 1) break;
      const topCard = gameState.discardPile.pop()!;
      gameState.deck = shuffle(gameState.discardPile);
      gameState.discardPile = [topCard];
    }
    const card = gameState.deck.shift();
    if (card) drawn.push(card);
  }

  return drawn;
}

export function getActiveSide(card: Card, gameState: GameState): { color: CardColor; value: string } {
  if (gameState.mode === 'flip') {
    if (gameState.side === 'dark' && card.dark) return card.dark;
    if (gameState.side === 'light' && card.light) return card.light;
  }
  return { color: card.color, value: card.value };
}

// check if a card is playable
export function isCardPlayable(card: Card, gameState: GameState): boolean {
  const activeSide = getActiveSide(card, gameState);
  // when penalty is active, both stacking cards and matching cards / wilds are allowed
  if (gameState.pendingPenaltyType !== null) {
    if (activeSide.value === gameState.pendingPenaltyType) return true;
    if (activeSide.value === 'wild' || activeSide.value === '+4') return true;
    return activeSide.color === gameState.activeColor || activeSide.value === gameState.activeValue;
  }

  // normal check
  if (activeSide.value === '+4' || activeSide.value === 'wild') return true;
  return activeSide.color === gameState.activeColor || activeSide.value === gameState.activeValue;
}

// advance turn
function advanceTurn(gameState: GameState, playerIds: string[], steps: number = 1) {
  const total = playerIds.length;
  const next = (gameState.currentTurnIndex + steps * gameState.direction) % total;
  gameState.currentTurnIndex = (next + total) % total;
  gameState.drawnCardId = null;
  gameState.canPassTurn = false;
}

// play a card
export function playCard(
  gameState: GameState,
  playerIds: string[],
  playerId: string,
  cardId: string,
  chosenColor?: CardColor
): { success: boolean; message?: string } {
  if (gameState.winnerId) return { success: false, message: 'Game has already ended' };

  const currentTurnPlayerId = playerIds[gameState.currentTurnIndex];
  if (currentTurnPlayerId !== playerId) {
    return { success: false, message: 'Not your turn' };
  }

  const hand = gameState.hands[playerId];
  if (!hand) return { success: false, message: 'Player not found' };

  const cardIndex = hand.findIndex(c => c.id === cardId);
  if (cardIndex === -1) return { success: false, message: 'Card not in hand' };

  const card = hand[cardIndex];
  if (!isCardPlayable(card, gameState)) {
    return { success: false, message: 'Invalid move according to UNO rules' };
  }

  const activeSide = getActiveSide(card, gameState);

  // check penalty handling
  const hadPenalty = gameState.pendingPenaltyType !== null;
  const isStacking = hadPenalty && activeSide.value === gameState.pendingPenaltyType;
  const penaltyToTake = hadPenalty && !isStacking ? gameState.accumulatedPenalty : 0;

  // remove card from hand and push to discard
  hand.splice(cardIndex, 1);
  gameState.discardPile.push(card);
  gameState.drawnCardId = null;
  gameState.canPassTurn = false;

  // if played regular card under penalty, draw penalty cards
  if (penaltyToTake > 0) {
    const penaltyDrawn = drawFromDeck(gameState, penaltyToTake);
    hand.push(...penaltyDrawn);
    gameState.pendingPenaltyType = null;
    gameState.accumulatedPenalty = 0;
  }

  // handle wild color
  let newColor = activeSide.color;
  if (activeSide.color === 'wild') {
    newColor = chosenColor || (gameState.side === 'dark' ? 'teal' : 'red');
  }
  gameState.activeColor = newColor as CardColor;
  gameState.activeValue = activeSide.value;

  // check win
  if (hand.length === 0) {
    gameState.winnerId = playerId;
    gameState.logs.unshift({
      id: Math.random().toString(),
      text: `🏆 Player won the game!`,
      time: Date.now()
    });
    return { success: true };
  }

  // card effect handling
  if (activeSide.value === '+2') {
    if (isStacking) {
      gameState.accumulatedPenalty += 2;
    } else {
      gameState.pendingPenaltyType = '+2';
      gameState.accumulatedPenalty = 2;
    }
    gameState.logs.unshift({
      id: Math.random().toString(),
      text: penaltyToTake > 0 
        ? `Took +${penaltyToTake} penalty & played +2! Stack is now +2`
        : `+2 played! Stack is now +${gameState.accumulatedPenalty}`,
      time: Date.now()
    });
    advanceTurn(gameState, playerIds, 1);
  } else if (activeSide.value === '+4') {
    if (isStacking) {
      gameState.accumulatedPenalty += 4;
    } else {
      gameState.pendingPenaltyType = '+4';
      gameState.accumulatedPenalty = 4;
    }
    gameState.logs.unshift({
      id: Math.random().toString(),
      text: penaltyToTake > 0 
        ? `Took +${penaltyToTake} penalty & played +4! New color: ${newColor.toUpperCase()}`
        : `+4 played! New color: ${newColor.toUpperCase()}. Stack: +${gameState.accumulatedPenalty}`,
      time: Date.now()
    });
    advanceTurn(gameState, playerIds, 1);
  } else if (activeSide.value === '+5') {
    if (isStacking) {
      gameState.accumulatedPenalty += 5;
    } else {
      gameState.pendingPenaltyType = '+5';
      gameState.accumulatedPenalty = 5;
    }
    gameState.logs.unshift({
      id: Math.random().toString(),
      text: penaltyToTake > 0 
        ? `Took +${penaltyToTake} penalty & played +5! Stack is now +5`
        : `+5 played! Stack is now +${gameState.accumulatedPenalty}`,
      time: Date.now()
    });
    advanceTurn(gameState, playerIds, 1);
  } else if (activeSide.value === 'skip') {
    gameState.logs.unshift({
      id: Math.random().toString(),
      text: penaltyToTake > 0
        ? `Took +${penaltyToTake} penalty & played Skip! Next player skipped.`
        : `Skip played! Next player skipped.`,
      time: Date.now()
    });
    if (playerIds.length === 2) {
      // in 2-player game, skip gives another turn
    } else {
      advanceTurn(gameState, playerIds, 2);
    }
  } else if (activeSide.value === 'skip_everyone') {
    gameState.logs.unshift({
      id: Math.random().toString(),
      text: penaltyToTake > 0
        ? `Took +${penaltyToTake} penalty & played Skip Everyone!`
        : `Skip Everyone played! Player gets another turn.`,
      time: Date.now()
    });
    // No advanceTurn, current player goes again.
  } else if (activeSide.value === 'reverse') {
    gameState.direction = (gameState.direction * -1) as 1 | -1;
    gameState.logs.unshift({
      id: Math.random().toString(),
      text: penaltyToTake > 0
        ? `Took +${penaltyToTake} penalty & played Reverse! Direction changed.`
        : `Reverse played! Play direction changed.`,
      time: Date.now()
    });
    if (playerIds.length === 2) {
      // in 2-player game, reverse works as skip
    } else {
      advanceTurn(gameState, playerIds, 1);
    }
  } else if (activeSide.value === 'wild') {
    gameState.logs.unshift({
      id: Math.random().toString(),
      text: penaltyToTake > 0
        ? `Took +${penaltyToTake} penalty & played Wild (${newColor.toUpperCase()})`
        : `Wild played! New color: ${newColor.toUpperCase()}`,
      time: Date.now()
    });
    advanceTurn(gameState, playerIds, 1);
  } else if (activeSide.value === 'wild_draw_color') {
    gameState.pendingPenaltyType = 'wild_draw_color';
    gameState.pendingDrawColor = newColor as CardColor;
    gameState.logs.unshift({
      id: Math.random().toString(),
      text: penaltyToTake > 0
        ? `Took +${penaltyToTake} penalty & played Wild Draw Color (${newColor.toUpperCase()})`
        : `Wild Draw Color played! Next player draws until ${newColor.toUpperCase()}`,
      time: Date.now()
    });
    advanceTurn(gameState, playerIds, 1);
  } else if (activeSide.value === 'flip') {
    gameState.side = gameState.side === 'light' ? 'dark' : 'light';
    
    // Flip discard pile and draw pile
    gameState.discardPile.reverse();
    gameState.deck.reverse();
    
    const newTopCard = gameState.discardPile[gameState.discardPile.length - 1];
    const newActiveSide = getActiveSide(newTopCard, gameState);
    
    let nextColor = newActiveSide.color;
    if (newActiveSide.color === 'wild') {
      const colors: CardColor[] = gameState.side === 'dark' ? ['orange', 'pink', 'teal', 'purple'] : ['red', 'blue', 'green', 'yellow'];
      nextColor = colors[Math.floor(Math.random() * colors.length)];
    }
    
    gameState.activeColor = nextColor as CardColor;
    gameState.activeValue = newActiveSide.value;

    gameState.logs.unshift({
      id: Math.random().toString(),
      text: penaltyToTake > 0
        ? `Took +${penaltyToTake} penalty & played Flip! Side changed to ${gameState.side.toUpperCase()}`
        : `Flip played! Side changed to ${gameState.side.toUpperCase()}. New color: ${gameState.activeColor.toUpperCase()}`,
      time: Date.now()
    });
    advanceTurn(gameState, playerIds, 1);
  } else {
    gameState.logs.unshift({
      id: Math.random().toString(),
      text: penaltyToTake > 0
        ? `Took +${penaltyToTake} penalty & played ${activeSide.color.toUpperCase()} ${activeSide.value}`
        : `Played ${activeSide.color.toUpperCase()} ${activeSide.value}`,
      time: Date.now()
    });
    advanceTurn(gameState, playerIds, 1);
  }

  return { success: true };
}

// draw card / take penalty
export function drawCard(gameState: GameState, playerIds: string[], playerId: string): { success: boolean; drawnCount: number; isPlayable: boolean } {
  if (gameState.winnerId) return { success: false, drawnCount: 0, isPlayable: false };

  const currentTurnPlayerId = playerIds[gameState.currentTurnIndex];
  if (currentTurnPlayerId !== playerId) {
    return { success: false, drawnCount: 0, isPlayable: false };
  }

  // if already drew this turn and clicking draw again, pass turn
  if (gameState.canPassTurn || gameState.drawnCardId) {
    passTurn(gameState, playerIds, playerId);
    return { success: true, drawnCount: 0, isPlayable: false };
  }

  const hand = gameState.hands[playerId];
  if (!hand) return { success: false, drawnCount: 0, isPlayable: false };

  // penalty draw
  if (gameState.pendingPenaltyType) {
    let count = 0;
    const drawn: Card[] = [];

    if (gameState.pendingPenaltyType === 'wild_draw_color') {
      const targetColor = gameState.pendingDrawColor;
      while (true) {
        const c = drawFromDeck(gameState, 1);
        if (c.length === 0) break; // deck is completely empty
        drawn.push(c[0]);
        count++;
        const activeSide = getActiveSide(c[0], gameState);
        if (activeSide.color === targetColor || activeSide.color === 'wild') { // Wild counts as any color usually, but let's strictly require the exact color for "wild_draw_color"? Actually rules say draw until you get a card of that color. A wild isn't that color. Let's just strictly match color.
          if (activeSide.color === targetColor) break;
        }
      }
      gameState.pendingDrawColor = null;
    } else {
      count = gameState.accumulatedPenalty;
      const c = drawFromDeck(gameState, count);
      drawn.push(...c);
    }

    gameState.pendingPenaltyType = null;
    gameState.accumulatedPenalty = 0;
    gameState.drawnCardId = null;

    hand.push(...drawn);

    // check if player has any playable card in hand
    const hasAnyPlayable = hand.some(c => isCardPlayable(c, gameState));

    if (hasAnyPlayable) {
      gameState.canPassTurn = true;
      gameState.logs.unshift({
        id: Math.random().toString(),
        text: `Drew +${count} penalty cards! Play a card or click draw to skip.`,
        time: Date.now()
      });
    } else {
      gameState.logs.unshift({
        id: Math.random().toString(),
        text: `Drew +${count} penalty cards (no valid moves).`,
        time: Date.now()
      });
      advanceTurn(gameState, playerIds, 1);
    }

    return { success: true, drawnCount: count, isPlayable: hasAnyPlayable };
  }

  // single card draw
  const drawn = drawFromDeck(gameState, 1);
  if (drawn.length === 0) {
    advanceTurn(gameState, playerIds, 1);
    return { success: true, drawnCount: 0, isPlayable: false };
  }

  const drawnCard = drawn[0];
  hand.push(drawnCard);

  const playable = isCardPlayable(drawnCard, gameState);

  if (playable) {
    // allow playing or passing
    gameState.drawnCardId = drawnCard.id;
    gameState.canPassTurn = true;
    gameState.logs.unshift({
      id: Math.random().toString(),
      text: `Drew a playable card (${drawnCard.color.toUpperCase()} ${drawnCard.value})! Play or pass.`,
      time: Date.now()
    });
  } else {
    gameState.drawnCardId = null;
    gameState.canPassTurn = false;
    gameState.logs.unshift({
      id: Math.random().toString(),
      text: `Drew 1 card`,
      time: Date.now()
    });
    advanceTurn(gameState, playerIds, 1);
  }

  return { success: true, drawnCount: 1, isPlayable: playable };
}

// pass turn after drawing
export function passTurn(gameState: GameState, playerIds: string[], playerId: string): boolean {
  const currentTurnPlayerId = playerIds[gameState.currentTurnIndex];
  if (currentTurnPlayerId !== playerId) return false;

  gameState.drawnCardId = null;
  gameState.canPassTurn = false;
  gameState.logs.unshift({
    id: Math.random().toString(),
    text: `Skipped / passed turn`,
    time: Date.now()
  });

  advanceTurn(gameState, playerIds, 1);
  return true;
}

// call uno
export function callUno(gameState: GameState, playerId: string): boolean {
  const hand = gameState.hands[playerId];
  if (hand && (hand.length === 1 || hand.length === 2)) {
    gameState.unoCalls[playerId] = true;
    gameState.logs.unshift({
      id: Math.random().toString(),
      text: `🔥 UNO called!`,
      time: Date.now()
    });
    return true;
  }
  return false;
}
