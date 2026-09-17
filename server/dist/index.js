"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const http_1 = __importDefault(require("http"));
const socket_io_1 = require("socket.io");
const cors_1 = __importDefault(require("cors"));
const rooms_1 = require("./rooms");
const game_1 = require("./game");
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use(express_1.default.json());
const server = http_1.default.createServer(app);
const io = new socket_io_1.Server(server, {
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
    const roomId = (0, rooms_1.createRoom)();
    res.json({ roomId });
});
// get room
app.get('/api/rooms/:roomId', (req, res) => {
    const room = (0, rooms_1.getRoom)(req.params.roomId);
    if (room) {
        res.json({ exists: true, room });
    }
    else {
        res.status(404).json({ exists: false });
    }
});
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
// admin auth middleware
const requireAdmin = (req, res, next) => {
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
    }
    else {
        res.status(401).json({ success: false, message: 'Incorrect admin password' });
    }
});
// get admin stats & rooms
app.get('/api/admin/overview', requireAdmin, (req, res) => {
    const overview = (0, rooms_1.getAdminOverview)();
    res.json(overview);
});
// delete room by admin
app.delete('/api/admin/rooms/:roomId', requireAdmin, (req, res) => {
    const roomId = req.params.roomId;
    io.to(roomId).emit('room-error', 'Room terminated by admin');
    const deleted = (0, rooms_1.deleteRoom)(roomId);
    res.json({ success: deleted });
});
// clean empty rooms
app.post('/api/admin/cleanup-empty', requireAdmin, (req, res) => {
    const count = (0, rooms_1.cleanEmptyRooms)();
    res.json({ success: true, cleanedCount: count });
});
// kick player by admin
app.post('/api/admin/rooms/:roomId/kick/:playerId', requireAdmin, (req, res) => {
    const roomId = req.params.roomId;
    const playerId = req.params.playerId;
    const room = (0, rooms_1.kickPlayer)(roomId, playerId);
    if (room) {
        io.to(roomId).emit('room-update', room);
        io.to(playerId).emit('room-error', 'You were removed from the room');
        res.json({ success: true, room });
    }
    else {
        res.status(404).json({ success: false });
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
        const room = (0, rooms_1.updatePlayerPing)(roomId, socket.id, ping);
        if (room) {
            io.to(roomId).emit('ping-update', { playerId: socket.id, ping, isOnline: true });
        }
    });
    // join room
    socket.on('join-room', ({ roomId, username }) => {
        const room = (0, rooms_1.addPlayer)(roomId, socket.id, username);
        if (!room) {
            socket.emit('room-error', 'Room not found');
            return;
        }
        socket.join(roomId);
        io.to(roomId).emit('room-update', room);
    });
    // start game
    socket.on('start-game', ({ roomId }) => {
        const room = (0, rooms_1.startGame)(roomId, socket.id);
        if (room) {
            io.to(roomId).emit('room-update', room);
        }
    });
    // change mode
    socket.on('change-mode', ({ roomId, mode }) => {
        const room = (0, rooms_1.changeMode)(roomId, socket.id, mode);
        if (room) {
            io.to(roomId).emit('room-update', room);
        }
    });
    // restart game
    socket.on('restart-game', ({ roomId }) => {
        const room = (0, rooms_1.restartGame)(roomId, socket.id);
        if (room) {
            io.to(roomId).emit('room-update', room);
        }
    });
    // back to lobby
    socket.on('back-to-lobby', ({ roomId }) => {
        const room = (0, rooms_1.returnToLobby)(roomId, socket.id);
        if (room) {
            io.to(roomId).emit('room-update', room);
        }
    });
    // play card
    socket.on('play-card', ({ roomId, cardId, chosenColor }) => {
        const room = (0, rooms_1.getRoom)(roomId);
        if (!room || !room.gameState)
            return;
        const sender = room.players.find(p => p.id === socket.id);
        if (sender === null || sender === void 0 ? void 0 : sender.isSpectator)
            return;
        const playerIds = room.players.filter(p => !p.isSpectator).map(p => p.id);
        const res = (0, game_1.playCard)(room.gameState, playerIds, socket.id, cardId, chosenColor);
        if (res.success) {
            // update wins
            if (room.gameState.winnerId) {
                const winner = room.players.find(p => { var _a; return p.id === ((_a = room.gameState) === null || _a === void 0 ? void 0 : _a.winnerId); });
                if (winner) {
                    winner.wins = (winner.wins || 0) + 1;
                }
            }
            io.to(roomId).emit('room-update', room);
        }
        else {
            socket.emit('game-error', res.message || 'Invalid move');
        }
    });
    // draw card
    socket.on('draw-card', ({ roomId }) => {
        const room = (0, rooms_1.getRoom)(roomId);
        if (!room || !room.gameState)
            return;
        const sender = room.players.find(p => p.id === socket.id);
        if (sender === null || sender === void 0 ? void 0 : sender.isSpectator)
            return;
        const playerIds = room.players.filter(p => !p.isSpectator).map(p => p.id);
        const res = (0, game_1.drawCard)(room.gameState, playerIds, socket.id);
        if (res.success) {
            io.to(roomId).emit('room-update', room);
        }
    });
    // pass turn
    socket.on('pass-turn', ({ roomId }) => {
        const room = (0, rooms_1.getRoom)(roomId);
        if (!room || !room.gameState)
            return;
        const sender = room.players.find(p => p.id === socket.id);
        if (sender === null || sender === void 0 ? void 0 : sender.isSpectator)
            return;
        const playerIds = room.players.filter(p => !p.isSpectator).map(p => p.id);
        if ((0, game_1.passTurn)(room.gameState, playerIds, socket.id)) {
            io.to(roomId).emit('room-update', room);
        }
    });
    // call uno
    socket.on('call-uno', ({ roomId }) => {
        const room = (0, rooms_1.getRoom)(roomId);
        if (!room || !room.gameState)
            return;
        const sender = room.players.find(p => p.id === socket.id);
        if (sender === null || sender === void 0 ? void 0 : sender.isSpectator)
            return;
        if ((0, game_1.callUno)(room.gameState, socket.id)) {
            io.to(roomId).emit('room-update', room);
        }
    });
    // leave room
    socket.on('leave-room', ({ roomId }) => {
        socket.leave(roomId);
        const result = (0, rooms_1.removePlayer)(socket.id);
        if (result) {
            io.to(result.roomId).emit('room-update', result.room);
        }
    });
    // handle disconnect
    socket.on('disconnect', () => {
        const result = (0, rooms_1.handleDisconnect)(socket.id);
        if (result) {
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
                .catch(() => { });
        }, 10 * 60 * 1000);
    }
});
