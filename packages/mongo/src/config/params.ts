declare function parseInt(value: unknown): number;

export const GLOBAL_CONFIG = {
    CC_REDIS_HOST: process.env.CC_REDIS_HOST || "127.0.0.1",
    CC_REDIS_PORT: parseInt(process.env.CC_REDIS_PORT) || 6379,
    CC_REDIS_USER: process.env.CC_REDIS_USER || "",
    CC_REDIS_PASSWORD: process.env.CC_REDIS_PASSWORD || "",
    CC_MONGO_CONNECTION_STRING: process.env.CC_MONGO_CONNECTION_STRING || "mongodb://localhost:27017/backtest-kit?wtimeoutMS=15000",
}

export const DEFAULT_CONFIG = Object.freeze({ ...GLOBAL_CONFIG });

export type Config = typeof GLOBAL_CONFIG;
