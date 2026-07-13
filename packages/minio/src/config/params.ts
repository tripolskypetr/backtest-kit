declare function parseInt(value: unknown): number;

const GLOBAL_CONFIG = {
  CC_REDIS_HOST: "",
  CC_REDIS_PORT: 0,
  CC_REDIS_USER: "",
  CC_REDIS_PASSWORD: "",
  CC_MINIO_ENDPOINT: process.env.CC_MINIO_ENDPOINT || "",
  CC_MINIO_PORT: parseInt(process.env.CC_MINIO_PORT) || 0,
  CC_MINIO_ACCESSKEY: process.env.CC_MINIO_ACCESSKEY || "",
  CC_MINIO_SECRETKEY: process.env.CC_MINIO_SECRETKEY || "",
};

export const DEFAULT_CONFIG = Object.freeze({ ...GLOBAL_CONFIG });

export type Config = typeof GLOBAL_CONFIG;

export const getConfig = () => {
  const config = {
    CC_REDIS_HOST: process.env.CC_REDIS_HOST || "127.0.0.1",
    CC_REDIS_PORT: parseInt(process.env.CC_REDIS_PORT) || 6379,
    CC_REDIS_USER: process.env.CC_REDIS_USER || "",
    CC_REDIS_PASSWORD: process.env.CC_REDIS_PASSWORD || "",

    CC_MINIO_ENDPOINT: process.env.CC_MINIO_ENDPOINT || "localhost",
    CC_MINIO_PORT: parseInt(process.env.CC_MINIO_PORT) || 9000,
    CC_MINIO_ACCESSKEY: process.env.CC_MINIO_ACCESSKEY || "minioadmin",
    CC_MINIO_SECRETKEY: process.env.CC_MINIO_SECRETKEY || "minioadmin",
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
  if (GLOBAL_CONFIG.CC_MINIO_ENDPOINT) {
    config.CC_MINIO_ENDPOINT = GLOBAL_CONFIG.CC_MINIO_ENDPOINT;
  }
  if (GLOBAL_CONFIG.CC_MINIO_PORT) {
    config.CC_MINIO_PORT = GLOBAL_CONFIG.CC_MINIO_PORT;
  }
  if (GLOBAL_CONFIG.CC_MINIO_ACCESSKEY) {
    config.CC_MINIO_ACCESSKEY = GLOBAL_CONFIG.CC_MINIO_ACCESSKEY;
  }
  if (GLOBAL_CONFIG.CC_MINIO_SECRETKEY) {
    config.CC_MINIO_SECRETKEY = GLOBAL_CONFIG.CC_MINIO_SECRETKEY;
  }
  return config;
};

export const setConfig = (config: Partial<Config>) => {
  Object.assign(GLOBAL_CONFIG, config);
};
