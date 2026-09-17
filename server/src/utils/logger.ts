import winston from 'winston';
import Transport from 'winston-transport';

const MAX_LOGS = 1000;

export interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  roomId?: string;
  stack?: string;
}

const memoryLogs: LogEntry[] = [];

export function getRecentLogs(roomId?: string) {
  if (roomId) {
    return memoryLogs.filter(log => log.roomId === roomId);
  }
  return [...memoryLogs]; // return a copy
}

class MemoryTransport extends Transport {
  constructor(opts?: Transport.TransportStreamOptions) {
    super(opts);
  }

  log(info: any, callback: () => void) {
    setImmediate(() => {
      this.emit('logged', info);
    });

    const entry: LogEntry = {
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

const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: logFormat,
  defaultMeta: { service: 'uno-server' },
  transports: [
    new winston.transports.Console({
      format: process.env.NODE_ENV === 'production'
        ? winston.format.json()
        : winston.format.combine(
            winston.format.colorize(),
            winston.format.printf(
              (info) => `${info.timestamp} ${info.level}: ${info.message} ${info.stack ? `\n${info.stack}` : ''}`
            )
          ),
    }),
    new MemoryTransport(),
  ],
});

export default logger;
