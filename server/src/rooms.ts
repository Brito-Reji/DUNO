import { GameState, initializeGame } from './game';

export interface Player {
  id: string;
  name: string;
  isHost: boolean;
  ping?: number;
  isOnline?: boolean;
}

export interface Room {
  id: string;
  createdAt: Date;
  players: Player[];
  status: 'waiting' | 'playing';
  gameState?: GameState;
}

// store active rooms
export const rooms = new Map<string, Room>();

// create new room
export function createRoom(): string {
  const roomId = Math.random().toString(36).substring(2, 8);
  rooms.set(roomId, {
    id: roomId,
    createdAt: new Date(),
    players: [],
    status: 'waiting'
  });
  return roomId;
}

// get room by id
export function getRoom(roomId: string): Room | undefined {
  return rooms.get(roomId);
}

// add player to room
export function addPlayer(roomId: string, playerId: string, name: string): Room | null {
  const room = rooms.get(roomId);
  if (!room) return null;

  // remove existing entry for same socket
  room.players = room.players.filter(p => p.id !== playerId);

  const isHost = room.players.length === 0;
  room.players.push({
    id: playerId,
    name,
    isHost,
    ping: 20,
    isOnline: true
  });

  return room;
}

// update player ping
export function updatePlayerPing(roomId: string, playerId: string, ping: number): Room | null {
  const room = rooms.get(roomId);
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

      // remove empty room
      if (room.players.length === 0) {
        rooms.delete(roomId);
      }

      return { roomId, room };
    }
  }
  return null;
}

// start game
export function startGame(roomId: string, hostId: string): Room | null {
  const room = rooms.get(roomId);
  if (!room || room.players.length < 2) return null;

  const host = room.players.find(p => p.id === hostId);
  if (!host || !host.isHost) return null;

  room.status = 'playing';
  room.gameState = initializeGame(room.players.map(p => p.id));
  return room;
}

// restart game
export function restartGame(roomId: string, hostId: string): Room | null {
  const room = rooms.get(roomId);
  if (!room || room.players.length < 2) return null;

  const host = room.players.find(p => p.id === hostId);
  if (!host || !host.isHost) return null;

  room.status = 'playing';
  room.gameState = initializeGame(room.players.map(p => p.id));
  return room;
}
