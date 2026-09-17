import { GameState, initializeGame } from './game';

export interface Player {
  id: string;
  name: string;
  isHost: boolean;
  ping?: number;
  isOnline?: boolean;
  wins?: number;
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
  room.players.push({
    id: playerId,
    name,
    isHost,
    ping: 20,
    isOnline: true,
    wins: prevWins
  });

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
      const playerName = room.players[playerIndex].name;
      const wasHost = room.players[playerIndex].isHost;
      room.players.splice(playerIndex, 1);

      // assign new host
      if (wasHost && room.players.length > 0) {
        room.players[0].isHost = true;
      }

      // cleanup game state
      if (room.gameState) {
        delete room.gameState.hands[playerId];
        room.gameState.logs.unshift({
          id: Math.random().toString(),
          text: `${playerName} left the room`,
          time: Date.now()
        });
        if (room.players.length >= 2) {
          room.gameState.currentTurnIndex = room.gameState.currentTurnIndex % room.players.length;
        }
      }

      // reset status if not enough players
      if (room.players.length < 2) {
        room.status = 'waiting';
        room.gameState = undefined;
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

  room.status = 'waiting';
  room.gameState = undefined;
  return room;
}
