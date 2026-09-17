import { GameState, initializeGame } from './game';

export interface Player {
  id: string;
  name: string;
  isHost: boolean;
  ping?: number;
  isOnline?: boolean;
  wins?: number;
  isSpectator?: boolean;
}

export interface Room {
  id: string;
  createdAt: Date;
  players: Player[];
  status: 'waiting' | 'playing';
  mode: 'normal' | 'flip';
  gameState?: GameState;
}

// store active rooms
export const rooms = new Map<string, Room>();

// empty room timers
const emptyRoomTimers = new Map<string, NodeJS.Timeout>();

// create new room
export function createRoom(): string {
  const roomId = Math.random().toString(36).substring(2, 8).toLowerCase();
  rooms.set(roomId, {
    id: roomId,
    createdAt: new Date(),
    players: [],
    status: 'waiting',
    mode: 'normal'
  });
  return roomId;
}

// get room by id
export function getRoom(roomId: string): Room | undefined {
  if (!roomId) return undefined;
  return rooms.get(roomId.trim().toLowerCase());
}

// add player to room
export function addPlayer(roomId: string, playerId: string, name: string): Room | null {
  const cleanId = (roomId || '').trim().toLowerCase();
  const room = rooms.get(cleanId);
  if (!room) return null;

  // cancel empty room cleanup
  const existingTimer = emptyRoomTimers.get(cleanId);
  if (existingTimer) {
    clearTimeout(existingTimer);
    emptyRoomTimers.delete(cleanId);
  }

  // keep previous wins if reconnecting
  const existingPlayer = room.players.find(p => p.id === playerId || p.name.toLowerCase() === name.toLowerCase());
  const prevWins = existingPlayer?.wins || 0;
  const wasHost = existingPlayer?.isHost;

  room.players = room.players.filter(p => p.id !== playerId && p.name.toLowerCase() !== name.toLowerCase());

  const isHost = wasHost !== undefined ? wasHost : room.players.length === 0;
  const isSpectator = room.status === 'playing';

  room.players.push({
    id: playerId,
    name,
    isHost,
    ping: 20,
    isOnline: true,
    wins: prevWins,
    isSpectator
  });

  // log spectator join
  if (isSpectator && room.gameState) {
    room.gameState.logs.unshift({
      id: Math.random().toString(),
      text: `👁 ${name} joined as a spectator`,
      time: Date.now()
    });
  }

  return room;
}

// update player ping
export function updatePlayerPing(roomId: string, playerId: string, ping: number): Room | null {
  const room = getRoom(roomId);
  if (!room) return null;

  const player = room.players.find(p => p.id === playerId);
  if (player) {
    player.ping = ping;
    player.isOnline = true;
    return room;
  }
  return null;
}

// remove player
export function removePlayer(playerId: string): { roomId: string; room: Room } | null {
  for (const [roomId, room] of rooms.entries()) {
    const playerIndex = room.players.findIndex(p => p.id === playerId);
    if (playerIndex !== -1) {
      const player = room.players[playerIndex];
      const playerName = player.name;
      const wasHost = player.isHost;
      const wasSpectator = player.isSpectator;
      room.players.splice(playerIndex, 1);

      // assign new host
      if (wasHost && room.players.length > 0) {
        room.players[0].isHost = true;
      }

      const activePlayers = room.players.filter(p => !p.isSpectator);

      // cleanup game state
      if (room.gameState && !wasSpectator) {
        delete room.gameState.hands[playerId];
        room.gameState.logs.unshift({
          id: Math.random().toString(),
          text: `${playerName} left the room`,
          time: Date.now()
        });
        if (activePlayers.length >= 2) {
          room.gameState.currentTurnIndex = room.gameState.currentTurnIndex % activePlayers.length;
        }
      }

      // reset status if not enough players
      if (activePlayers.length < 2 && room.status === 'playing') {
        room.status = 'waiting';
        room.gameState = undefined;
        room.players.forEach(p => { p.isSpectator = false; });
      }

      // delay empty room deletion
      if (room.players.length === 0) {
        const timer = setTimeout(() => {
          rooms.delete(roomId);
          emptyRoomTimers.delete(roomId);
        }, 60000);
        emptyRoomTimers.set(roomId, timer);
      }

      return { roomId, room };
    }
  }
  return null;
}

// start game
export function startGame(roomId: string, hostId: string): Room | null {
  const room = getRoom(roomId);
  if (!room || room.players.length < 2) return null;

  const host = room.players.find(p => p.id === hostId);
  if (!host || !host.isHost) return null;

  room.players.forEach(p => { p.isSpectator = false; });
  room.status = 'playing';
  room.gameState = initializeGame(room.players.map(p => p.id), room.mode);
  return room;
}

// restart game
export function restartGame(roomId: string, hostId: string): Room | null {
  const room = getRoom(roomId);
  if (!room || room.players.length < 2) return null;

  const host = room.players.find(p => p.id === hostId);
  if (!host || !host.isHost) return null;

  room.players.forEach(p => { p.isSpectator = false; });
  room.status = 'playing';
  room.gameState = initializeGame(room.players.map(p => p.id), room.mode);
  return room;
}

// change mode
export function changeMode(roomId: string, hostId: string, mode: 'normal' | 'flip'): Room | null {
  const room = getRoom(roomId);
  if (!room || room.status !== 'waiting') return null;

  const host = room.players.find(p => p.id === hostId);
  if (!host || !host.isHost) return null;

  room.mode = mode;
  return room;
}

// return room to lobby
export function returnToLobby(roomId: string, hostId: string): Room | null {
  const room = getRoom(roomId);
  if (!room) return null;

  const host = room.players.find(p => p.id === hostId);
  if (!host || !host.isHost) return null;

  room.players.forEach(p => { p.isSpectator = false; });
  room.status = 'waiting';
  room.gameState = undefined;
  return room;
}

// delete room
export function deleteRoom(roomId: string): boolean {
  const cleanId = (roomId || '').trim().toLowerCase();
  const timer = emptyRoomTimers.get(cleanId);
  if (timer) {
    clearTimeout(timer);
    emptyRoomTimers.delete(cleanId);
  }
  return rooms.delete(cleanId);
}

// clean all empty rooms
export function cleanEmptyRooms(): number {
  let count = 0;
  for (const [roomId, room] of rooms.entries()) {
    if (room.players.length === 0) {
      deleteRoom(roomId);
      count++;
    }
  }
  return count;
}

// kick player
export function kickPlayer(roomId: string, playerId: string): Room | null {
  const cleanId = (roomId || '').trim().toLowerCase();
  const room = rooms.get(cleanId);
  if (!room) return null;

  const res = removePlayer(playerId);
  return res ? res.room : room;
}

// admin overview
export function getAdminOverview() {
  const mem = process.memoryUsage();
  const activeRoomsList = [];
  let totalPlayers = 0;
  let totalSpectators = 0;
  let playingRoomsCount = 0;
  let waitingRoomsCount = 0;

  for (const [roomId, room] of rooms.entries()) {
    if (room.status === 'playing') playingRoomsCount++;
    else waitingRoomsCount++;

    const playersInfo = room.players.map(p => {
      if (p.isSpectator) totalSpectators++;
      else totalPlayers++;

      const handCount = room.gameState?.hands[p.id]?.length ?? 0;
      return {
        id: p.id,
        name: p.name,
        isHost: p.isHost,
        isSpectator: p.isSpectator || false,
        ping: p.ping ?? 0,
        isOnline: p.isOnline !== false,
        wins: p.wins || 0,
        cardCount: handCount
      };
    });

    let gameStateSummary = undefined;
    if (room.gameState) {
      const activePlayers = room.players.filter(p => !p.isSpectator);
      const curTurnPlayer = activePlayers[room.gameState.currentTurnIndex];
      const topDiscard = room.gameState.discardPile[room.gameState.discardPile.length - 1];
      const latestLog = room.gameState.logs[0]?.text || '';

      gameStateSummary = {
        side: room.gameState.side,
        activeColor: room.gameState.activeColor,
        activeValue: room.gameState.activeValue,
        direction: room.gameState.direction,
        currentTurnPlayerName: curTurnPlayer?.name || 'Unknown',
        currentTurnPlayerId: curTurnPlayer?.id || '',
        topDiscardCard: topDiscard,
        deckCount: room.gameState.deck.length,
        discardCount: room.gameState.discardPile.length,
        accumulatedPenalty: room.gameState.accumulatedPenalty,
        pendingPenaltyType: room.gameState.pendingPenaltyType,
        winnerId: room.gameState.winnerId,
        latestLog
      };
    }

    activeRoomsList.push({
      id: roomId,
      createdAt: room.createdAt,
      status: room.status,
      mode: room.mode,
      playersCount: room.players.length,
      spectatorsCount: room.players.filter(p => p.isSpectator).length,
      players: playersInfo,
      gameState: gameStateSummary
    });
  }

  return {
    stats: {
      uptimeSeconds: Math.floor(process.uptime()),
      memory: {
        rssMb: +(mem.rss / 1024 / 1024).toFixed(2),
        heapUsedMb: +(mem.heapUsed / 1024 / 1024).toFixed(2),
        heapTotalMb: +(mem.heapTotal / 1024 / 1024).toFixed(2),
        externalMb: +(mem.external / 1024 / 1024).toFixed(2)
      },
      totalRooms: rooms.size,
      playingRooms: playingRoomsCount,
      waitingRooms: waitingRoomsCount,
      totalPlayers,
      totalSpectators
    },
    rooms: activeRoomsList
  };
}
