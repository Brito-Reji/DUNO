"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.rooms = void 0;
exports.createRoom = createRoom;
exports.getRoom = getRoom;
exports.addPlayer = addPlayer;
exports.updatePlayerPing = updatePlayerPing;
exports.handleDisconnect = handleDisconnect;
exports.removePlayer = removePlayer;
exports.startGame = startGame;
exports.restartGame = restartGame;
exports.changeMode = changeMode;
exports.returnToLobby = returnToLobby;
exports.deleteRoom = deleteRoom;
exports.cleanEmptyRooms = cleanEmptyRooms;
exports.kickPlayer = kickPlayer;
exports.getAdminOverview = getAdminOverview;
const game_1 = require("./game");
const logger_1 = __importDefault(require("./utils/logger"));
// store active rooms
exports.rooms = new Map();
// empty room timers
const emptyRoomTimers = new Map();
// player disconnect timers
const disconnectTimers = new Map();
// create new room
function createRoom() {
    const roomId = Math.random().toString(36).substring(2, 8).toLowerCase();
    exports.rooms.set(roomId, {
        id: roomId,
        createdAt: new Date(),
        players: [],
        status: 'waiting',
        mode: 'normal'
    });
    logger_1.default.info(`Room created`, { roomId });
    return roomId;
}
// get room by id
function getRoom(roomId) {
    if (!roomId)
        return undefined;
    return exports.rooms.get(roomId.trim().toLowerCase());
}
// add player to room
function addPlayer(roomId, playerId, name) {
    const cleanId = (roomId || '').trim().toLowerCase();
    const room = exports.rooms.get(cleanId);
    if (!room)
        return null;
    // cancel empty room cleanup
    const existingTimer = emptyRoomTimers.get(cleanId);
    if (existingTimer) {
        clearTimeout(existingTimer);
        emptyRoomTimers.delete(cleanId);
    }
    const cleanName = (name || '').trim();
    // cancel disconnect timer if reconnecting
    const timerKey = `${cleanId}:${cleanName.toLowerCase()}`;
    const disconnectTimer = disconnectTimers.get(timerKey);
    if (disconnectTimer) {
        clearTimeout(disconnectTimer);
        disconnectTimers.delete(timerKey);
    }
    // check if player is reconnecting
    const existingPlayer = room.players.find(p => p.id === playerId || p.name.toLowerCase() === cleanName.toLowerCase());
    if (existingPlayer) {
        const oldId = existingPlayer.id;
        existingPlayer.id = playerId;
        existingPlayer.name = cleanName;
        existingPlayer.isOnline = true;
        existingPlayer.ping = 20;
        // rebind game hand and uno status
        if (room.gameState) {
            if (oldId !== playerId) {
                if (room.gameState.hands[oldId]) {
                    room.gameState.hands[playerId] = room.gameState.hands[oldId];
                    delete room.gameState.hands[oldId];
                }
                if (room.gameState.unoCalls[oldId] !== undefined) {
                    room.gameState.unoCalls[playerId] = room.gameState.unoCalls[oldId];
                    delete room.gameState.unoCalls[oldId];
                }
            }
            room.gameState.logs.unshift({
                id: Math.random().toString(),
                text: `⚡ ${cleanName} reconnected to the game`,
                time: Date.now()
            });
        }
        return room;
    }
    // add new player
    const isHost = room.players.length === 0;
    const isSpectator = room.status === 'playing';
    room.players.push({
        id: playerId,
        name: cleanName,
        isHost,
        ping: 20,
        isOnline: true,
        wins: 0,
        isSpectator
    });
    logger_1.default.info(`Player ${cleanName} joined as ${isSpectator ? 'spectator' : 'player'}`, { roomId: cleanId });
    // log spectator join
    if (isSpectator && room.gameState) {
        room.gameState.logs.unshift({
            id: Math.random().toString(),
            text: `👁 ${cleanName} joined as a spectator`,
            time: Date.now()
        });
    }
    return room;
}
// update player ping
function updatePlayerPing(roomId, playerId, ping) {
    const room = getRoom(roomId);
    if (!room)
        return null;
    const player = room.players.find(p => p.id === playerId);
    if (player) {
        player.ping = ping;
        player.isOnline = true;
        return room;
    }
    return null;
}
// handle socket disconnect with grace period
function handleDisconnect(playerId) {
    for (const [roomId, room] of exports.rooms.entries()) {
        const player = room.players.find(p => p.id === playerId);
        if (player) {
            player.isOnline = false;
            // grace period if game is active
            if (room.status === 'playing' && !player.isSpectator) {
                const timerKey = `${roomId}:${player.name.toLowerCase()}`;
                if (disconnectTimers.has(timerKey)) {
                    clearTimeout(disconnectTimers.get(timerKey));
                }
                const timer = setTimeout(() => {
                    disconnectTimers.delete(timerKey);
                    const curRoom = exports.rooms.get(roomId);
                    const curPlayer = curRoom === null || curRoom === void 0 ? void 0 : curRoom.players.find(p => p.name.toLowerCase() === player.name.toLowerCase());
                    if (curPlayer && !curPlayer.isOnline) {
                        removePlayer(curPlayer.id);
                    }
                }, 30000);
                disconnectTimers.set(timerKey, timer);
                return { roomId, room };
            }
            return removePlayer(playerId);
        }
    }
    return null;
}
// remove player
function removePlayer(playerId) {
    for (const [roomId, room] of exports.rooms.entries()) {
        const playerIndex = room.players.findIndex(p => p.id === playerId);
        if (playerIndex !== -1) {
            const player = room.players[playerIndex];
            const playerName = player.name;
            const wasHost = player.isHost;
            const wasSpectator = player.isSpectator;
            const timerKey = `${roomId}:${playerName.toLowerCase()}`;
            if (disconnectTimers.has(timerKey)) {
                clearTimeout(disconnectTimers.get(timerKey));
                disconnectTimers.delete(timerKey);
            }
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
                    exports.rooms.delete(roomId);
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
function startGame(roomId, hostId) {
    const room = getRoom(roomId);
    if (!room || room.players.length < 2)
        return null;
    const host = room.players.find(p => p.id === hostId);
    if (!host || !host.isHost)
        return null;
    room.players.forEach(p => { p.isSpectator = false; });
    room.status = 'playing';
    room.gameState = (0, game_1.initializeGame)(room.players.map(p => p.id), roomId, room.mode);
    logger_1.default.info(`Game started`, { roomId });
    return room;
}
// restart game
function restartGame(roomId, hostId) {
    const room = getRoom(roomId);
    if (!room || room.players.length < 2)
        return null;
    const host = room.players.find(p => p.id === hostId);
    if (!host || !host.isHost)
        return null;
    room.players.forEach(p => { p.isSpectator = false; });
    room.status = 'playing';
    room.gameState = (0, game_1.initializeGame)(room.players.map(p => p.id), roomId, room.mode);
    logger_1.default.info(`Game restarted`, { roomId });
    return room;
}
// change mode
function changeMode(roomId, hostId, mode) {
    const room = getRoom(roomId);
    if (!room || room.status !== 'waiting')
        return null;
    const host = room.players.find(p => p.id === hostId);
    if (!host || !host.isHost)
        return null;
    room.mode = mode;
    return room;
}
// return room to lobby
function returnToLobby(roomId, hostId) {
    const room = getRoom(roomId);
    if (!room)
        return null;
    const host = room.players.find(p => p.id === hostId);
    if (!host || !host.isHost)
        return null;
    room.players.forEach(p => { p.isSpectator = false; });
    room.status = 'waiting';
    room.gameState = undefined;
    return room;
}
// delete room
function deleteRoom(roomId) {
    const cleanId = (roomId || '').trim().toLowerCase();
    const timer = emptyRoomTimers.get(cleanId);
    if (timer) {
        clearTimeout(timer);
        emptyRoomTimers.delete(cleanId);
    }
    return exports.rooms.delete(cleanId);
}
// clean all empty rooms
function cleanEmptyRooms() {
    let count = 0;
    for (const [roomId, room] of exports.rooms.entries()) {
        if (room.players.length === 0) {
            deleteRoom(roomId);
            count++;
        }
    }
    return count;
}
// kick player
function kickPlayer(roomId, playerId) {
    const cleanId = (roomId || '').trim().toLowerCase();
    const room = exports.rooms.get(cleanId);
    if (!room)
        return null;
    const res = removePlayer(playerId);
    return res ? res.room : room;
}
// admin overview
function getAdminOverview() {
    var _a;
    const mem = process.memoryUsage();
    const activeRoomsList = [];
    let totalPlayers = 0;
    let totalSpectators = 0;
    let playingRoomsCount = 0;
    let waitingRoomsCount = 0;
    for (const [roomId, room] of exports.rooms.entries()) {
        if (room.status === 'playing')
            playingRoomsCount++;
        else
            waitingRoomsCount++;
        const playersInfo = room.players.map(p => {
            var _a, _b;
            var _c, _d;
            if (p.isSpectator)
                totalSpectators++;
            else
                totalPlayers++;
            const handCount = (_c = (_b = (_a = room.gameState) === null || _a === void 0 ? void 0 : _a.hands[p.id]) === null || _b === void 0 ? void 0 : _b.length) !== null && _c !== void 0 ? _c : 0;
            return {
                id: p.id,
                name: p.name,
                isHost: p.isHost,
                isSpectator: p.isSpectator || false,
                ping: (_d = p.ping) !== null && _d !== void 0 ? _d : 0,
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
            const latestLog = ((_a = room.gameState.logs[0]) === null || _a === void 0 ? void 0 : _a.text) || '';
            gameStateSummary = {
                side: room.gameState.side,
                activeColor: room.gameState.activeColor,
                activeValue: room.gameState.activeValue,
                direction: room.gameState.direction,
                currentTurnPlayerName: (curTurnPlayer === null || curTurnPlayer === void 0 ? void 0 : curTurnPlayer.name) || 'Unknown',
                currentTurnPlayerId: (curTurnPlayer === null || curTurnPlayer === void 0 ? void 0 : curTurnPlayer.id) || '',
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
            totalRooms: exports.rooms.size,
            playingRooms: playingRoomsCount,
            waitingRooms: waitingRoomsCount,
            totalPlayers,
            totalSpectators
        },
        rooms: activeRoomsList
    };
}
