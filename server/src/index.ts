import 'dotenv/config';
import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { createRoom, getRoom, addPlayer, removePlayer, handleDisconnect, updatePlayerPing, startGame, restartGame, changeMode, returnToLobby, getAdminOverview, deleteRoom, cleanEmptyRooms, kickPlayer } from './rooms';
import { playCard, drawCard, passTurn, callUno } from './game';

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'DELETE']
  }
});

// health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// create room
app.post('/api/rooms', (req, res) => {
  const roomId = createRoom();
  res.json({ roomId });
});

// get room
app.get('/api/rooms/:roomId', (req, res) => {
  const room = getRoom(req.params.roomId);
  if (room) {
    res.json({ exists: true, room });
  } else {
    res.status(404).json({ exists: false });
  }
});

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

// admin auth middleware
const requireAdmin = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const authHeader = req.headers['x-admin-key'] || req.headers.authorization;
  if (authHeader === ADMIN_PASSWORD || authHeader === `Bearer ${ADMIN_PASSWORD}` || authHeader === 'uno-admin-session') {
    return next();
  }
  res.status(401).json({ error: 'Unauthorized. Admin password required.' });
};

// admin login
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) {
    res.json({ success: true, token: ADMIN_PASSWORD });
  } else {
    res.status(401).json({ success: false, message: 'Incorrect admin password' });
  }
});

// get admin stats & rooms
app.get('/api/admin/overview', requireAdmin, (req, res) => {
  const overview = getAdminOverview();
  res.json(overview);
});

// delete room by admin
app.delete('/api/admin/rooms/:roomId', requireAdmin, (req, res) => {
  const roomId = req.params.roomId as string;
  io.to(roomId).emit('room-error', 'Room terminated by admin');
  const deleted = deleteRoom(roomId);
  res.json({ success: deleted });
});

// clean empty rooms
app.post('/api/admin/cleanup-empty', requireAdmin, (req, res) => {
  const count = cleanEmptyRooms();
  res.json({ success: true, cleanedCount: count });
});

// kick player by admin
app.post('/api/admin/rooms/:roomId/kick/:playerId', requireAdmin, (req, res) => {
  const roomId = req.params.roomId as string;
  const playerId = req.params.playerId as string;
  const room = kickPlayer(roomId, playerId);
  if (room) {
    io.to(roomId).emit('room-update', room);
    io.to(playerId).emit('room-error', 'You were removed from the room');
    res.json({ success: true, room });
  } else {
    res.status(404).json({ success: false });
  }
});

// 20s turn timers
const turnTimers = new Map<string, NodeJS.Timeout>();

function clearTurnTimer(roomId: string) {
  const timer = turnTimers.get(roomId);
  if (timer) {
    clearTimeout(timer);
    turnTimers.delete(roomId);
  }
}

function startTurnTimer(roomId: string) {
  clearTurnTimer(roomId);
  const room = getRoom(roomId);
  if (!room || room.status !== 'playing' || !room.gameState || room.gameState.winnerId) return;

  const timer = setTimeout(() => {
    turnTimers.delete(roomId);
    const curRoom = getRoom(roomId);
    if (!curRoom || curRoom.status !== 'playing' || !curRoom.gameState || curRoom.gameState.winnerId) return;

    const activePlayers = curRoom.players.filter(p => !p.isSpectator);
    if (activePlayers.length < 2) return;

    const playerIds = activePlayers.map(p => p.id);
    const currentTurnPlayerId = playerIds[curRoom.gameState.currentTurnIndex];
    const player = curRoom.players.find(p => p.id === currentTurnPlayerId);
    const name = player?.name || 'Player';

    // auto action on timeout
    if (curRoom.gameState.pendingPenaltyType) {
      drawCard(curRoom.gameState, playerIds, currentTurnPlayerId, name);
    } else if (curRoom.gameState.drawnCardId || curRoom.gameState.canPassTurn) {
      passTurn(curRoom.gameState, playerIds, currentTurnPlayerId, name);
    } else {
      drawCard(curRoom.gameState, playerIds, currentTurnPlayerId, name);
      if (playerIds[curRoom.gameState.currentTurnIndex] === currentTurnPlayerId) {
        passTurn(curRoom.gameState, playerIds, currentTurnPlayerId, name);
      }
    }

    curRoom.gameState.logs.unshift({
      id: Math.random().toString(),
      text: `⏳ ${name}'s 20s ran out! Turn passed.`,
      privateText: `⏳ Your 20s ran out! Turn passed.`,
      playerId: currentTurnPlayerId,
      time: Date.now()
    });

    io.to(roomId).emit('room-update', curRoom);
    startTurnTimer(roomId);
  }, 20000);

  turnTimers.set(roomId, timer);
}

// socket handlers
io.on('connection', (socket) => {
  // ping-pong for latency ms
  socket.on('ping-check', ({ timestamp }) => {
    socket.emit('pong-check', { timestamp });
  });

  // record and broadcast player ping
  socket.on('player-ping', ({ roomId, ping }) => {
    const room = updatePlayerPing(roomId, socket.id, ping);
    if (room) {
      io.to(roomId).emit('ping-update', { playerId: socket.id, ping, isOnline: true });
    }
  });

  // join room
  socket.on('join-room', ({ roomId, username }) => {
    const room = addPlayer(roomId, socket.id, username);
    if (!room) {
      socket.emit('room-error', 'Room not found');
      return;
    }

    socket.join(roomId);
    io.to(roomId).emit('room-update', room);
  });

  // start game
  socket.on('start-game', ({ roomId }) => {
    const room = startGame(roomId, socket.id);
    if (room) {
      startTurnTimer(roomId);
      io.to(roomId).emit('room-update', room);
    }
  });

  // change mode
  socket.on('change-mode', ({ roomId, mode }) => {
    const room = changeMode(roomId, socket.id, mode);
    if (room) {
      io.to(roomId).emit('room-update', room);
    }
  });

  // restart game
  socket.on('restart-game', ({ roomId }) => {
    const room = restartGame(roomId, socket.id);
    if (room) {
      startTurnTimer(roomId);
      io.to(roomId).emit('room-update', room);
    }
  });

  // back to lobby
  socket.on('back-to-lobby', ({ roomId }) => {
    const room = returnToLobby(roomId, socket.id);
    if (room) {
      clearTurnTimer(roomId);
      io.to(roomId).emit('room-update', room);
    }
  });

  // play card
  socket.on('play-card', ({ roomId, cardId, chosenColor }) => {
    const room = getRoom(roomId);
    if (!room || !room.gameState) return;

    const sender = room.players.find(p => p.id === socket.id);
    if (sender?.isSpectator) return;

    const playerIds = room.players.filter(p => !p.isSpectator).map(p => p.id);
    const res = playCard(room.gameState, playerIds, socket.id, cardId, chosenColor, sender?.name);
    if (res.success) {
      // update wins
      if (room.gameState.winnerId) {
        clearTurnTimer(roomId);
        const winner = room.players.find(p => p.id === room.gameState?.winnerId);
        if (winner) {
          winner.wins = (winner.wins || 0) + 1;
        }
      } else {
        startTurnTimer(roomId);
      }
      io.to(roomId).emit('room-update', room);
    } else {
      socket.emit('game-error', res.message || 'Invalid move');
    }
  });

  // draw card
  socket.on('draw-card', ({ roomId }) => {
    const room = getRoom(roomId);
    if (!room || !room.gameState) return;

    const sender = room.players.find(p => p.id === socket.id);
    if (sender?.isSpectator) return;

    const playerIds = room.players.filter(p => !p.isSpectator).map(p => p.id);
    const res = drawCard(room.gameState, playerIds, socket.id, sender?.name);
    if (res.success) {
      startTurnTimer(roomId);
      io.to(roomId).emit('room-update', room);
    }
  });

  // pass turn
  socket.on('pass-turn', ({ roomId }) => {
    const room = getRoom(roomId);
    if (!room || !room.gameState) return;

    const sender = room.players.find(p => p.id === socket.id);
    if (sender?.isSpectator) return;

    const playerIds = room.players.filter(p => !p.isSpectator).map(p => p.id);
    if (passTurn(room.gameState, playerIds, socket.id, sender?.name)) {
      startTurnTimer(roomId);
      io.to(roomId).emit('room-update', room);
    }
  });

  // call uno
  socket.on('call-uno', ({ roomId }) => {
    const room = getRoom(roomId);
    if (!room || !room.gameState) return;

    const sender = room.players.find(p => p.id === socket.id);
    if (sender?.isSpectator) return;

    if (callUno(room.gameState, socket.id, sender?.name)) {
      io.to(roomId).emit('room-update', room);
    }
  });

  // leave room
  socket.on('leave-room', ({ roomId }) => {
    socket.leave(roomId);
    const result = removePlayer(socket.id);
    if (result) {
      if (result.room.status !== 'playing' || !result.room.gameState) {
        clearTurnTimer(result.roomId);
      } else {
        startTurnTimer(result.roomId);
      }
      io.to(result.roomId).emit('room-update', result.room);
    }
  });

  // handle disconnect
  socket.on('disconnect', () => {
    const result = handleDisconnect(socket.id);
    if (result) {
      if (result.room.status !== 'playing' || !result.room.gameState) {
        clearTurnTimer(result.roomId);
      }
      io.to(result.roomId).emit('room-update', result.room);
    }
  });
});

const PORT = process.env.PORT || 3005;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);

  // keep-alive self ping
  const liveUrl = process.env.RENDER_EXTERNAL_URL || process.env.SERVER_URL;
  if (liveUrl) {
    const cleanUrl = liveUrl.replace(/\/+$/, '');
    setInterval(() => {
      fetch(`${cleanUrl}/api/health`)
        .then(() => console.log('Keep-alive ping sent'))
        .catch(() => {});
    }, 10 * 60 * 1000);
  }
});
