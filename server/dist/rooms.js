"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.rooms = void 0;
exports.createRoom = createRoom;
exports.getRoom = getRoom;
// In-memory room storage
exports.rooms = new Map();
function createRoom() {
    const roomId = Math.random().toString(36).substring(2, 8);
    exports.rooms.set(roomId, {
        createdAt: new Date(),
        players: []
    });
    return roomId;
}
function getRoom(roomId) {
    return exports.rooms.get(roomId);
}
