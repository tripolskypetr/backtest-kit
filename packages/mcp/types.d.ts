import http from 'http';
import * as tradeforge from 'tradeforge';
import { IMCPPositionOpenCommand, IMCPPositionCloseCommand, IMCPAverageBuyCommand, IMCPSignalNotifyCommand, IMCPMessage } from 'tradeforge';

interface ILogger {
    log(topic: string, ...args: any[]): void;
    debug(topic: string, ...args: any[]): void;
    info(topic: string, ...args: any[]): void;
    warn(topic: string, ...args: any[]): void;
}

/**
 * Attaches a custom logger to the internal `LoggerService`.
 *
 * By default the package logs to `console`. Pass your own {@link ILogger} implementation
 * to redirect output to an external logging system (Winston, Pino, Datadog, etc.).
 *
 * @param logger - Object with `log`, `debug`, `info`, and `warn` methods.
 *   Each method receives a string topic followed by arbitrary arguments.
 *
 * @example
 * import winston from "winston";
 *
 * setLogger({
 *   log:   (topic, ...args) => winston.verbose(topic, ...args),
 *   debug: (topic, ...args) => winston.debug(topic, ...args),
 *   info:  (topic, ...args) => winston.info(topic, ...args),
 *   warn:  (topic, ...args) => winston.warn(topic, ...args),
 * });
 */
declare function setLogger(logger: ILogger): void;

type CallbackFn = (error?: Error) => void;
declare function serve(host?: string, port?: number, callback?: CallbackFn): () => void;
declare function getRouter(): http.RequestListener;

declare const GLOBAL_CONFIG: {
    CC_MCP_HOST: string;
    CC_MCP_PORT: number;
    CC_MCP_NAME: string;
};
type Config = typeof GLOBAL_CONFIG;
declare const getConfig: () => {
    CC_MCP_HOST: string;
    CC_MCP_PORT: number;
    CC_MCP_NAME: string;
};
declare const setConfig: (config: Partial<Config>) => void;

declare class LoggerService implements ILogger {
    private _commonLogger;
    log: (topic: string, ...args: any[]) => Promise<void>;
    debug: (topic: string, ...args: any[]) => Promise<void>;
    info: (topic: string, ...args: any[]) => Promise<void>;
    warn: (topic: string, ...args: any[]) => Promise<void>;
    setLogger: (logger: ILogger) => void;
}

declare class MCPPrivateService {
    private readonly loggerService;
    getStatus: (mcpName: string) => Promise<tradeforge.IMCPMessage[]>;
    commitPositionOpen: (dto: IMCPPositionOpenCommand) => Promise<void>;
    commitPositionClose: (dto: IMCPPositionCloseCommand) => Promise<void>;
    commitAverageBuy: (dto: IMCPAverageBuyCommand) => Promise<boolean>;
    commitSignalNotify: (dto: IMCPSignalNotifyCommand) => Promise<void>;
}

declare class MCPPublicService {
    private readonly loggerService;
    private readonly mcpPrivateService;
    getStatus: () => Promise<tradeforge.IMCPMessage[]>;
    commitPositionOpen: (dto: {
        symbol: string;
        position: "long" | "short";
        note: string;
    }) => Promise<void>;
    commitPositionClose: (dto: {
        symbol: string;
        note: string;
    }) => Promise<void>;
    commitAverageBuy: (dto: {
        symbol: string;
    }) => Promise<boolean>;
    commitSignalNotify: (dto: {
        symbol: string;
        note: string;
    }) => Promise<void>;
}

declare class MCPCommandService {
    private readonly loggerService;
    getStatus: () => Promise<IMCPMessage[]>;
    commitPositionOpen: (dto: {
        symbol: string;
        position: "long" | "short";
        note: string;
    }) => Promise<any>;
    commitPositionClose: (dto: {
        symbol: string;
        note: string;
    }) => Promise<any>;
    commitAverageBuy: (dto: {
        symbol: string;
    }) => Promise<any>;
    commitSignalNotify: (dto: {
        symbol: string;
        note: string;
    }) => Promise<any>;
}

declare const ioc: {
    mcpCommandService: MCPCommandService;
    mcpPublicService: MCPPublicService;
    mcpPrivateService: MCPPrivateService;
    loggerService: LoggerService;
};

export { getConfig, getRouter, ioc as lib, serve, setConfig, setLogger };
