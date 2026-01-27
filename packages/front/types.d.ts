import http from 'http';
import * as backtest_kit from 'backtest-kit';
import { CandleInterval, NotificationModel, IStorageSignalRow } from 'backtest-kit';
import * as functools_kit from 'functools-kit';

declare function serve(host?: string, port?: number): () => void;
declare function getRouter(): http.RequestListener;

interface ILogger {
    log(topic: string, ...args: any[]): void;
    debug(topic: string, ...args: any[]): void;
    info(topic: string, ...args: any[]): void;
    warn(topic: string, ...args: any[]): void;
}

declare const setLogger: (logger: ILogger) => void;

declare class LoggerService implements ILogger {
    private _commonLogger;
    log: (topic: string, ...args: any[]) => Promise<void>;
    debug: (topic: string, ...args: any[]) => Promise<void>;
    info: (topic: string, ...args: any[]) => Promise<void>;
    warn: (topic: string, ...args: any[]) => Promise<void>;
    setLogger: (logger: ILogger) => void;
}

type ExchangeName = string;
declare class ExchangeService {
    private readonly loggerService;
    getCandles: (dto: {
        symbol: string;
        interval: CandleInterval;
        exchangeName: ExchangeName;
        currentTime: number;
    }) => Promise<backtest_kit.ICandleData[]>;
}

declare class NotificationMockService {
    private readonly loggerService;
    getData: () => Promise<NotificationModel[]>;
}

declare class StorageMockService {
    private readonly loggerService;
    findSignalById: (signalId: string) => Promise<IStorageSignalRow>;
    listSignalLive: () => Promise<IStorageSignalRow[]>;
    listSignalBacktest: () => Promise<IStorageSignalRow[]>;
}

declare class ExchangeMockService {
    private readonly loggerService;
    private readonly storageMockService;
    private readonly exchangeService;
    getCandles: (signalId: string, interval: CandleInterval) => Promise<backtest_kit.ICandleData[]>;
}

declare class NotificationViewService {
    private readonly loggerService;
    getData: () => Promise<backtest_kit.NotificationModel[]>;
    protected init: (() => Promise<void>) & functools_kit.ISingleshotClearable;
}

declare class StorageViewService {
    private readonly loggerService;
    findSignalById: (signalId: string) => Promise<backtest_kit.IStorageSignalRow>;
    listSignalLive: () => Promise<backtest_kit.IStorageSignalRow[]>;
    listSignalBacktest: () => Promise<backtest_kit.IStorageSignalRow[]>;
    protected init: (() => Promise<void>) & functools_kit.ISingleshotClearable;
}

declare class ExchangeViewService {
    private readonly loggerService;
    private readonly storageViewService;
    private readonly exchangeService;
    getCandles: (signalId: string, interval: CandleInterval) => Promise<backtest_kit.ICandleData[]>;
}

declare const ioc: {
    notificationViewService: NotificationViewService;
    storageViewService: StorageViewService;
    exchangeViewService: ExchangeViewService;
    notificationMockService: NotificationMockService;
    storageMockService: StorageMockService;
    exchangeMockService: ExchangeMockService;
    loggerService: LoggerService;
    exchangeService: ExchangeService;
};

export { getRouter, ioc as lib, serve, setLogger };
