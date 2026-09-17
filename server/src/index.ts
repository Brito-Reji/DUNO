import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { createRoom, getRoom, addPlayer, removePlayer, updatePlayerPing, startGame, restartGame, changeMode, returnToLobby } from './rooms';
import { playCard, drawCard, passTurn, callUno } from './game';

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

app.post('/api/rooms', (req, res) => {
  const roomId = createRoom();
  res.json({ roomId });
});

app.get('/api/rooms/:roomId', (req, res) => {
  const room = getRoom(req.params.roomId);
  if (room) {
    res.json({ exists: true, room });
  } else {
    res.status(404).json({ exists: false });
  }
});

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
      io.to(roomId).emit('room-update', room);
    }
  });

  // back to lobby
  socket.on('back-to-lobby', ({ roomId }) => {
    const room = returnToLobby(roomId, socket.id);
    if (room) {
      io.to(roomId).emit('room-update', room);
    }
  });

  // play card
  socket.on('play-card', ({ roomId, cardId, chosenColor }) => {
    const room = getRoom(roomId);
    if (!room || !room.gameState) return;

    const playerIds = room.players.map(p => p.id);
    const res = playCard(room.gameState, playerIds, socket.id, cardId, chosenColor);
    if (res.success) {
      // update wins
      if (room.gameState.winnerId) {
        const winner = room.players.find(p => p.id === room.gameState?.winnerId);
        if (winner) {
          winner.wins = (winner.wins || 0) + 1;
        }
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

    const playerIds = room.players.map(p => p.id);
    const res = drawCard(room.gameState, playerIds, socket.id);
    if (res.success) {
      io.to(roomId).emit('room-update', room);
    }
  });

  // pass turn
  socket.on('pass-turn', ({ roomId }) => {
    const room = getRoom(roomId);
    if (!room || !room.gameState) return;

    const playerIds = room.players.map(p => p.id);
    if (passTurn(room.gameState, playerIds, socket.id)) {
      io.to(roomId).emit('room-update', room);
    }
  });

  // call uno
  socket.on('call-uno', ({ roomId }) => {
    const room = getRoom(roomId);
    if (!room || !room.gameState) return;

    if (callUno(room.gameState, socket.id)) {
      io.to(roomId).emit('room-update', room);
    }
  });

  // leave room
  socket.on('leave-room', ({ roomId }) => {
    socket.leave(roomId);
    const result = removePlayer(socket.id);
    if (result) {
      io.to(result.roomId).emit('room-update', result.room);
    }
  });

  // handle disconnect
  socket.on('disconnect', () => {
    const result = removePlayer(socket.id);
    if (result) {
      io.to(result.roomId).emit('room-update', result.room);
    }
  });
});

const PORT = 3005;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
