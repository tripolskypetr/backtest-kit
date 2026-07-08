declare function parseInt(value: unknown): number;

const GLOBAL_CONFIG = {
  CC_REDIS_HOST: "",
  CC_REDIS_PORT: 0,
  CC_REDIS_USER: "",
  CC_REDIS_PASSWORD: "",
  CC_POSTGRES_CONNECTION_STRING: "",
};

export const DEFAULT_CONFIG = Object.freeze({ ...GLOBAL_CONFIG });

export type Config = typeof GLOBAL_CONFIG;

export const getConfig = () => {
  const config = {
    CC_REDIS_HOST: process.env.CC_REDIS_HOST || "127.0.0.1",
    CC_REDIS_PORT: parseInt(process.env.CC_REDIS_PORT) || 6379,
    CC_REDIS_USER: process.env.CC_REDIS_USER || "",
    CC_REDIS_PASSWORD: process.env.CC_REDIS_PASSWORD || "",
    CC_POSTGRES_CONNECTION_STRING:
      process.env.CC_POSTGRES_CONNECTION_STRING ||
      "postgres://backtest:mysecurepassword@localhost:5432/backtest-pro",
  };
  if (GLOBAL_CONFIG.CC_REDIS_HOST) {
    config.CC_REDIS_HOST = GLOBAL_CONFIG.CC_REDIS_HOST;
  }
  if (GLOBAL_CONFIG.CC_REDIS_PORT) {
    config.CC_REDIS_PORT = GLOBAL_CONFIG.CC_REDIS_PORT;
  }
  if (GLOBAL_CONFIG.CC_REDIS_USER) {
    config.CC_REDIS_USER = GLOBAL_CONFIG.CC_REDIS_USER;
  }
  if (GLOBAL_CONFIG.CC_REDIS_PASSWORD) {
    config.CC_REDIS_PASSWORD = GLOBAL_CONFIG.CC_REDIS_PASSWORD;
  }
  if (GLOBAL_CONFIG.CC_POSTGRES_CONNECTION_STRING) {
    config.CC_POSTGRES_CONNECTION_STRING =
      GLOBAL_CONFIG.CC_POSTGRES_CONNECTION_STRING;
  }
  return config;
};

export const setConfig = (config: Partial<Config>) => {
  Object.assign(GLOBAL_CONFIG, config);
};
