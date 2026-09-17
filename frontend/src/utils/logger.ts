// Simple frontend logger wrapper

const isProduction = import.meta.env?.MODE === 'production';

export const logger = {
  debug: (...args: any[]) => {
    if (!isProduction) {
      console.log(`[DEBUG] ${new Date().toISOString()} -`, ...args);
    }
  },
  info: (...args: any[]) => {
    console.info(`[INFO] ${new Date().toISOString()} -`, ...args);
  },
  warn: (...args: any[]) => {
    console.warn(`[WARN] ${new Date().toISOString()} -`, ...args);
  },
  error: (...args: any[]) => {
    console.error(`[ERROR] ${new Date().toISOString()} -`, ...args);
  },
};

export default logger;
