declare const GLOBAL_CONFIG: {
    CC_REDIS_HOST: string;
    CC_REDIS_PORT: number;
    CC_REDIS_USER: string;
    CC_REDIS_PASSWORD: string;
    CC_MONGO_CONNECTION_STRING: string;
};
type Config = typeof GLOBAL_CONFIG;

interface ILogger {
    log(topic: string, ...args: any[]): void;
    debug(topic: string, ...args: any[]): void;
    info(topic: string, ...args: any[]): void;
    warn(topic: string, ...args: any[]): void;
}

declare function setup(config?: Config): void;
declare function install(): void;
declare function setLogger(logger: ILogger): void;
declare function setConfig(config?: Config): void;

export { install, setConfig, setLogger, setup };
