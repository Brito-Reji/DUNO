"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const logger_1 = __importStar(require("./utils/logger"));
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
// get server logs
app.get('/api/admin/logs', requireAdmin, (req, res) => {
    const roomId = req.query.roomId;
    const logs = (0, logger_1.getRecentLogs)(roomId);
    res.json({ logs });
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
// 20s turn timers
const turnTimers = new Map();
function clearTurnTimer(roomId) {
    const timer = turnTimers.get(roomId);
    if (timer) {
        clearTimeout(timer);
        turnTimers.delete(roomId);
    }
}
function startTurnTimer(roomId) {
    clearTurnTimer(roomId);
    const room = (0, rooms_1.getRoom)(roomId);
    if (!room || room.status !== 'playing' || !room.gameState || room.gameState.winnerId)
        return;
    const timer = setTimeout(() => {
        turnTimers.delete(roomId);
        const curRoom = (0, rooms_1.getRoom)(roomId);
        if (!curRoom || curRoom.status !== 'playing' || !curRoom.gameState || curRoom.gameState.winnerId)
            return;
        const activePlayers = curRoom.players.filter(p => !p.isSpectator);
        if (activePlayers.length < 2)
            return;
        const playerIds = activePlayers.map(p => p.id);
        const currentTurnPlayerId = playerIds[curRoom.gameState.currentTurnIndex];
        const player = curRoom.players.find(p => p.id === currentTurnPlayerId);
        const name = (player === null || player === void 0 ? void 0 : player.name) || 'Player';
        // auto action on timeout
        let timeoutDrawn = 0;
        if (curRoom.gameState.pendingPenaltyType) {
            const res = (0, game_1.drawCard)(curRoom.gameState, playerIds, currentTurnPlayerId, name);
            timeoutDrawn = res.drawnCount || 1;
        }
        else if (curRoom.gameState.drawnCardId || curRoom.gameState.canPassTurn) {
            (0, game_1.passTurn)(curRoom.gameState, playerIds, currentTurnPlayerId, name);
        }
        else {
            const res = (0, game_1.drawCard)(curRoom.gameState, playerIds, currentTurnPlayerId, name);
            timeoutDrawn = res.drawnCount || 1;
            if (playerIds[curRoom.gameState.currentTurnIndex] === currentTurnPlayerId) {
                (0, game_1.passTurn)(curRoom.gameState, playerIds, currentTurnPlayerId, name);
            }
        }
        if (timeoutDrawn > 0) {
            io.to(roomId).emit('player-drew-cards', { playerId: currentTurnPlayerId, count: timeoutDrawn });
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
            startTurnTimer(roomId);
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
            startTurnTimer(roomId);
            io.to(roomId).emit('room-update', room);
        }
    });
    // back to lobby
    socket.on('back-to-lobby', ({ roomId }) => {
        const room = (0, rooms_1.returnToLobby)(roomId, socket.id);
        if (room) {
            clearTurnTimer(roomId);
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
        const res = (0, game_1.playCard)(room.gameState, playerIds, socket.id, cardId, chosenColor, sender === null || sender === void 0 ? void 0 : sender.name);
        if (res.success) {
            if (res.penaltyDrawn && res.penaltyDrawn > 0) {
                io.to(roomId).emit('player-drew-cards', { playerId: socket.id, count: res.penaltyDrawn });
            }
            // update wins
            if (room.gameState.winnerId) {
                clearTurnTimer(roomId);
                const winner = room.players.find(p => { var _a; return p.id === ((_a = room.gameState) === null || _a === void 0 ? void 0 : _a.winnerId); });
                if (winner) {
                    winner.wins = (winner.wins || 0) + 1;
                }
            }
            else {
                startTurnTimer(roomId);
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
        const res = (0, game_1.drawCard)(room.gameState, playerIds, socket.id, sender === null || sender === void 0 ? void 0 : sender.name);
        if (res.success) {
            if (res.drawnCount > 0) {
                io.to(roomId).emit('player-drew-cards', { playerId: socket.id, count: res.drawnCount });
            }
            startTurnTimer(roomId);
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
        if ((0, game_1.passTurn)(room.gameState, playerIds, socket.id, sender === null || sender === void 0 ? void 0 : sender.name)) {
            startTurnTimer(roomId);
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
        if ((0, game_1.callUno)(room.gameState, socket.id, sender === null || sender === void 0 ? void 0 : sender.name)) {
            io.to(roomId).emit('room-update', room);
        }
    });
    // leave room
    socket.on('leave-room', ({ roomId }) => {
        socket.leave(roomId);
        const result = (0, rooms_1.removePlayer)(socket.id);
        if (result) {
            if (result.room.status !== 'playing' || !result.room.gameState) {
                clearTurnTimer(result.roomId);
            }
            else {
                startTurnTimer(result.roomId);
            }
            io.to(result.roomId).emit('room-update', result.room);
        }
    });
    // handle disconnect
    socket.on('disconnect', () => {
        const result = (0, rooms_1.handleDisconnect)(socket.id);
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
    logger_1.default.info(`Server listening on port ${PORT}`);
    // keep-alive self ping
    const liveUrl = process.env.RENDER_EXTERNAL_URL || process.env.SERVER_URL;
    if (liveUrl) {
        const cleanUrl = liveUrl.replace(/\/+$/, '');
        setInterval(() => {
            fetch(`${cleanUrl}/api/health`)
                .then(() => logger_1.default.debug('Keep-alive ping sent'))
                .catch(() => { });
        }, 10 * 60 * 1000);
    }
});
