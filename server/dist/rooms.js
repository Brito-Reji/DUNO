"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.rooms = void 0;
exports.createRoom = createRoom;
exports.getRoom = getRoom;
exports.addPlayer = addPlayer;
exports.updatePlayerPing = updatePlayerPing;
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
// store active rooms
exports.rooms = new Map();
// empty room timers
const emptyRoomTimers = new Map();
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
    // keep previous wins if reconnecting
    const existingPlayer = room.players.find(p => p.id === playerId || p.name.toLowerCase() === name.toLowerCase());
    const prevWins = (existingPlayer === null || existingPlayer === void 0 ? void 0 : existingPlayer.wins) || 0;
    const wasHost = existingPlayer === null || existingPlayer === void 0 ? void 0 : existingPlayer.isHost;
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
// remove player
function removePlayer(playerId) {
    for (const [roomId, room] of exports.rooms.entries()) {
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
    room.gameState = (0, game_1.initializeGame)(room.players.map(p => p.id), room.mode);
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
    room.gameState = (0, game_1.initializeGame)(room.players.map(p => p.id), room.mode);
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
