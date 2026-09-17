"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const rooms_1 = require("./rooms");
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use(express_1.default.json());
app.post('/api/rooms', (req, res) => {
    const roomId = (0, rooms_1.createRoom)();
    res.json({ roomId });
});
app.get('/api/rooms/:roomId', (req, res) => {
    const room = (0, rooms_1.getRoom)(req.params.roomId);
    if (room) {
        res.json({ exists: true });
    }
    else {
        res.status(404).json({ exists: false });
    }
});
const PORT = 3005;
app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});
