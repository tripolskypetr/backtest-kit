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

interface SymbolModel {
    icon: string;
    logo: string;
    symbol: string;
    displayName: string;
    color: string;
    priority: number;
    description: string;
}

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
        signalStartTime: number;
        signalStopTime: number;
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

declare class SymbolConnectionService {
    private readonly loggerService;
    getSymbolList: (() => Promise<{
        color: string;
        description: string;
        symbol: string;
        icon: string;
        logo: string;
        priority: number;
        displayName: string;
        index: number;
    }[]>) & functools_kit.ISingleshotClearable;
    protected init: (() => Promise<void>) & functools_kit.ISingleshotClearable;
}

declare class SymbolMetaService {
    private readonly symbolConnectionService;
    private readonly loggerService;
    getSymbolList: (() => Promise<string[]>) & functools_kit.ISingleshotClearable;
    getSymbolMap: (() => Promise<{}>) & functools_kit.ISingleshotClearable;
    getSymbol: ((symbol: string) => Promise<{
        color: string;
        description: string;
        symbol: string;
        icon: string;
        logo: string;
        priority: number;
        displayName: string;
        index: number;
    }>) & functools_kit.IClearableMemoize<string> & functools_kit.IControlMemoize<string, Promise<{
        color: string;
        description: string;
        symbol: string;
        icon: string;
        logo: string;
        priority: number;
        displayName: string;
        index: number;
    }>>;
}

declare const ioc: {
    notificationViewService: NotificationViewService;
    storageViewService: StorageViewService;
    exchangeViewService: ExchangeViewService;
    notificationMockService: NotificationMockService;
    storageMockService: StorageMockService;
    exchangeMockService: ExchangeMockService;
    symbolMetaService: SymbolMetaService;
    symbolConnectionService: SymbolConnectionService;
    loggerService: LoggerService;
    exchangeService: ExchangeService;
};

export { type SymbolModel, getRouter, ioc as lib, serve, setLogger };
