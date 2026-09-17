"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRecentLogs = getRecentLogs;
const winston_1 = __importDefault(require("winston"));
const winston_transport_1 = __importDefault(require("winston-transport"));
const MAX_LOGS = 1000;
const memoryLogs = [];
function getRecentLogs(roomId) {
    if (roomId) {
        return memoryLogs.filter(log => log.roomId === roomId);
    }
    return [...memoryLogs]; // return a copy
}
class MemoryTransport extends winston_transport_1.default {
    constructor(opts) {
        super(opts);
    }
    log(info, callback) {
        setImmediate(() => {
            this.emit('logged', info);
        });
        const entry = {
            timestamp: info.timestamp,
            level: info.level,
            message: info.message,
            roomId: info.roomId,
            stack: info.stack,
        };
        memoryLogs.push(entry);
        if (memoryLogs.length > MAX_LOGS) {
            memoryLogs.shift();
        }
        callback();
    }
}
const logFormat = winston_1.default.format.combine(winston_1.default.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), winston_1.default.format.errors({ stack: true }), winston_1.default.format.splat(), winston_1.default.format.json());
const logger = winston_1.default.createLogger({
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
    format: logFormat,
    defaultMeta: { service: 'uno-server' },
    transports: [
        new winston_1.default.transports.Console({
            format: process.env.NODE_ENV === 'production'
                ? winston_1.default.format.json()
                : winston_1.default.format.combine(winston_1.default.format.colorize(), winston_1.default.format.printf((info) => `${info.timestamp} ${info.level}: ${info.message} ${info.stack ? `\n${info.stack}` : ''}`)),
        }),
        new MemoryTransport(),
    ],
});
exports.default = logger;
