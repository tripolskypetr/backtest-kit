import http from 'http';
import * as backtest_kit from 'backtest-kit';
import { CandleInterval, NotificationModel, IStorageSignalRow, ILogEntry, IPublicSignalRow } from 'backtest-kit';
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

declare function getModulesPath(): string;

declare function getPublicPath(): string;

declare class LoggerService implements ILogger {
    private _commonLogger;
    log: (topic: string, ...args: any[]) => Promise<void>;
    debug: (topic: string, ...args: any[]) => Promise<void>;
    info: (topic: string, ...args: any[]) => Promise<void>;
    warn: (topic: string, ...args: any[]) => Promise<void>;
    setLogger: (logger: ILogger) => void;
}

type ExchangeName$1 = string;
declare class ExchangeService {
    private readonly loggerService;
    getRangeCandles: (dto: {
        symbol: string;
        interval: CandleInterval;
        exchangeName: ExchangeName$1;
        signalStartTime: number;
        signalStopTime: number;
    }) => Promise<backtest_kit.ICandleData[]>;
    getPointCandles: (dto: {
        symbol: string;
        interval: CandleInterval;
        exchangeName: ExchangeName$1;
        currentTime: number;
    }) => Promise<backtest_kit.ICandleData[]>;
    getLastCandles: (dto: {
        symbol: string;
        interval: CandleInterval;
        exchangeName: ExchangeName$1;
        limit: number;
    }) => Promise<any>;
}

declare class NotificationMockService {
    private readonly loggerService;
    findByFilter: <T extends object = Record<string, string>>(filterData: T, limit?: number, offset?: number) => Promise<NotificationModel[]>;
    getList: () => Promise<NotificationModel[]>;
    getOne: (id: string) => Promise<NotificationModel>;
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
    getSignalCandles: (signalId: string, interval: CandleInterval) => Promise<backtest_kit.ICandleData[]>;
    getLiveCandles: (signalId: string, interval: CandleInterval) => Promise<backtest_kit.ICandleData[]>;
    getLastCandles: (symbol: string, interval: CandleInterval) => Promise<any>;
}

declare class LogMockService {
    private readonly loggerService;
    findByFilter: <T extends object = Record<string, string>>(filterData: T, limit?: number, offset?: number) => Promise<ILogEntry[]>;
    getList: () => Promise<ILogEntry[]>;
    getOne: (id: string) => Promise<ILogEntry>;
}

declare class StatusMockService {
    private readonly loggerService;
    private readonly signalMockService;
    getStatusInfo: () => Promise<any>;
    getStatusList: () => Promise<any>;
    getStatusMap: () => Promise<any>;
    getStatusOne: (id: string) => Promise<{
        signalId: any;
        position: any;
        symbol: any;
        exchangeName: any;
        strategyName: any;
        totalEntries: any;
        totalPartials: any;
        originalPriceStopLoss: any;
        originalPriceTakeProfit: any;
        originalPriceOpen: any;
        priceOpen: any;
        priceTakeProfit: any;
        priceStopLoss: any;
        pnlPercentage: any;
        pnlCost: any;
        pnlEntries: any;
        partialExecuted: any;
        minuteEstimatedTime: any;
        pendingAt: any;
        timestamp: any;
        updatedAt: number;
        positionLevels: any;
        positionEntries: any;
        positionPartials: any;
    }>;
}

declare class MarkdownMockService {
    private readonly loggerService;
    getStrategyData: (symbol: string, strategyName: string, exchangeName: string, frameName: string) => Promise<unknown>;
    getStrategyReport: (symbol: string, strategyName: string, exchangeName: string, frameName: string) => Promise<string>;
    getBacktestData: (symbol: string, strategyName: string, exchangeName: string, frameName: string) => Promise<unknown>;
    getBacktestReport: (symbol: string, strategyName: string, exchangeName: string, frameName: string) => Promise<string>;
    getLiveData: (symbol: string, strategyName: string, exchangeName: string) => Promise<unknown>;
    getLiveReport: (symbol: string, strategyName: string, exchangeName: string) => Promise<string>;
    getBreakevenData: (symbol: string, strategyName: string, exchangeName: string, frameName: string) => Promise<unknown>;
    getBreakevenReport: (symbol: string, strategyName: string, exchangeName: string, frameName: string) => Promise<string>;
    getRiskData: (symbol: string, strategyName: string, exchangeName: string, frameName: string) => Promise<unknown>;
    getRiskReport: (symbol: string, strategyName: string, exchangeName: string, frameName: string) => Promise<string>;
    getPartialData: (symbol: string, strategyName: string, exchangeName: string, frameName: string) => Promise<unknown>;
    getPartialReport: (symbol: string, strategyName: string, exchangeName: string, frameName: string) => Promise<string>;
    getHighestProfitData: (symbol: string, strategyName: string, exchangeName: string, frameName: string) => Promise<unknown>;
    getHighestProfitReport: (symbol: string, strategyName: string, exchangeName: string, frameName: string) => Promise<string>;
    getScheduleData: (symbol: string, strategyName: string, exchangeName: string, frameName: string) => Promise<unknown>;
    getScheduleReport: (symbol: string, strategyName: string, exchangeName: string, frameName: string) => Promise<string>;
    getPerformanceData: (symbol: string, strategyName: string, exchangeName: string, frameName: string) => Promise<unknown>;
    getPerformanceReport: (symbol: string, strategyName: string, exchangeName: string, frameName: string) => Promise<string>;
    getSyncData: (symbol: string, strategyName: string, exchangeName: string, frameName: string) => Promise<unknown>;
    getSyncReport: (symbol: string, strategyName: string, exchangeName: string, frameName: string) => Promise<string>;
    getHeatData: (strategyName: string, exchangeName: string, frameName: string) => Promise<unknown>;
    getHeatReport: (strategyName: string, exchangeName: string, frameName: string) => Promise<string>;
    getWalkerData: (symbol: string, walkerName: string) => Promise<unknown>;
    getWalkerReport: (symbol: string, walkerName: string) => Promise<string>;
}

interface ExplorerFile {
    id: string;
    path: string;
    label: string;
    type: "file";
    mimeType: string;
}
interface ExplorerDirectory {
    id: string;
    path: string;
    label: string;
    type: "directory";
    nodes: ExplorerNode[];
}
type ExplorerNode = ExplorerFile | ExplorerDirectory;

declare class ExplorerMockService {
    private readonly loggerService;
    getNode: (nodePath: string) => Promise<string>;
    getTree: () => Promise<ExplorerNode[]>;
}

declare class SignalMockService {
    private readonly loggerService;
    getLastUpdateTimestamp: (signalId: string) => Promise<number>;
    getPendingSignal: (symbol: string) => Promise<IPublicSignalRow>;
}

declare class HeatMockService {
    private readonly loggerService;
    getStrategyHeatData: () => Promise<any>;
    getStrategyHeatReport: () => Promise<string>;
}

declare class NotificationViewService {
    private readonly loggerService;
    private readonly notificationMockService;
    findByFilter: <T extends object = Record<string, string>>(filterData: T, limit?: number, offset?: number) => Promise<NotificationModel[]>;
    getList: () => Promise<NotificationModel[]>;
    getOne: (id: string) => Promise<NotificationModel>;
    protected init: (() => Promise<void>) & functools_kit.ISingleshotClearable;
}

declare class StatusViewService {
    private readonly loggerService;
    private readonly statusMockService;
    private readonly signalViewService;
    getStatusList: () => Promise<any>;
    getStatusMap: () => Promise<any>;
    getStatusOne: (id: string) => Promise<{
        signalId: any;
        position: any;
        symbol: any;
        exchangeName: any;
        strategyName: any;
        totalEntries: any;
        totalPartials: any;
        originalPriceStopLoss: any;
        originalPriceTakeProfit: any;
        originalPriceOpen: any;
        priceOpen: any;
        priceTakeProfit: any;
        priceStopLoss: any;
        pnlPercentage: any;
        pnlCost: any;
        pnlEntries: any;
        partialExecuted: any;
        minuteEstimatedTime: any;
        pendingAt: any;
        timestamp: any;
        updatedAt: number;
        positionLevels: any;
        positionEntries: any;
        positionPartials: any;
    }>;
    getStatusInfo: () => Promise<any>;
}

declare class StorageViewService {
    private readonly loggerService;
    private readonly storageMockService;
    findSignalById: (signalId: string) => Promise<backtest_kit.IStorageSignalRow>;
    listSignalLive: () => Promise<backtest_kit.IStorageSignalRow[]>;
    listSignalBacktest: () => Promise<backtest_kit.IStorageSignalRow[]>;
    protected init: (() => Promise<void>) & functools_kit.ISingleshotClearable;
}

declare class ExchangeViewService {
    private readonly loggerService;
    private readonly storageViewService;
    private readonly exchangeService;
    private readonly exchangeMockService;
    private readonly signalViewService;
    getSignalCandles: (signalId: string, interval: CandleInterval) => Promise<backtest_kit.ICandleData[]>;
    getLiveCandles: (signalId: string, interval: CandleInterval) => Promise<backtest_kit.ICandleData[]>;
    getLastCandles: (symbol: string, interval: CandleInterval) => Promise<any>;
}

declare class LogViewService {
    private readonly loggerService;
    private readonly logMockService;
    findByFilter: <T extends object = Record<string, string>>(filterData: T, limit?: number, offset?: number) => Promise<ILogEntry[]>;
    getList: () => Promise<ILogEntry[]>;
    getOne: (id: string) => Promise<ILogEntry>;
    protected init: (() => Promise<void>) & functools_kit.ISingleshotClearable;
}

declare class MarkdownViewService {
    private readonly loggerService;
    private readonly markdownMockService;
    getStrategyData: (symbol: string, strategyName: string, exchangeName: string, frameName: string, backtest?: boolean) => Promise<unknown>;
    getStrategyReport: (symbol: string, strategyName: string, exchangeName: string, frameName: string, backtest?: boolean) => Promise<string>;
    getBacktestData: (symbol: string, strategyName: string, exchangeName: string, frameName: string) => Promise<unknown>;
    getBacktestReport: (symbol: string, strategyName: string, exchangeName: string, frameName: string) => Promise<string>;
    getLiveData: (symbol: string, strategyName: string, exchangeName: string) => Promise<unknown>;
    getLiveReport: (symbol: string, strategyName: string, exchangeName: string) => Promise<string>;
    getBreakevenData: (symbol: string, strategyName: string, exchangeName: string, frameName: string, backtest?: boolean) => Promise<unknown>;
    getBreakevenReport: (symbol: string, strategyName: string, exchangeName: string, frameName: string, backtest?: boolean) => Promise<string>;
    getRiskData: (symbol: string, strategyName: string, exchangeName: string, frameName: string, backtest?: boolean) => Promise<unknown>;
    getRiskReport: (symbol: string, strategyName: string, exchangeName: string, frameName: string, backtest?: boolean) => Promise<string>;
    getPartialData: (symbol: string, strategyName: string, exchangeName: string, frameName: string, backtest?: boolean) => Promise<unknown>;
    getPartialReport: (symbol: string, strategyName: string, exchangeName: string, frameName: string, backtest?: boolean) => Promise<string>;
    getHighestProfitData: (symbol: string, strategyName: string, exchangeName: string, frameName: string, backtest?: boolean) => Promise<unknown>;
    getHighestProfitReport: (symbol: string, strategyName: string, exchangeName: string, frameName: string, backtest?: boolean) => Promise<string>;
    getScheduleData: (symbol: string, strategyName: string, exchangeName: string, frameName: string, backtest?: boolean) => Promise<unknown>;
    getScheduleReport: (symbol: string, strategyName: string, exchangeName: string, frameName: string, backtest?: boolean) => Promise<string>;
    getPerformanceData: (symbol: string, strategyName: string, exchangeName: string, frameName: string, backtest?: boolean) => Promise<unknown>;
    getPerformanceReport: (symbol: string, strategyName: string, exchangeName: string, frameName: string, backtest?: boolean) => Promise<string>;
    getSyncData: (symbol: string, strategyName: string, exchangeName: string, frameName: string, backtest?: boolean) => Promise<unknown>;
    getSyncReport: (symbol: string, strategyName: string, exchangeName: string, frameName: string, backtest?: boolean) => Promise<string>;
    getHeatData: (strategyName: string, exchangeName: string, frameName: string, backtest?: boolean) => Promise<unknown>;
    getHeatReport: (strategyName: string, exchangeName: string, frameName: string, backtest?: boolean) => Promise<string>;
    getWalkerData: (symbol: string, walkerName: string) => Promise<unknown>;
    getWalkerReport: (symbol: string, walkerName: string) => Promise<string>;
}

declare class ExplorerViewService {
    private readonly loggerService;
    private readonly explorerMockService;
    private getDir;
    getNode: (nodePath: string) => Promise<string>;
    getTree: () => Promise<ExplorerNode[]>;
}

declare class SignalViewService {
    private readonly loggerService;
    private readonly signalMockService;
    getLastUpdateTimestamp: (signalId: string) => Promise<number>;
    getPendingSignal: (symbol: string) => Promise<backtest_kit.IPublicSignalRow>;
}

declare class HeatViewService {
    private readonly loggerService;
    private readonly heatMockService;
    getStrategyHeatData: () => Promise<any>;
    getStrategyHeatReport: () => Promise<string>;
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

type ExchangeName = string;
type StrategyName = string;
type FrameName = string;
declare class PriceConnectionService {
    private readonly loggerService;
    getSignalPendingPrice: (symbol: string, strategyName: StrategyName, exchangeName: ExchangeName, frameName: FrameName, backtest: boolean) => Promise<number>;
}

declare class LiveMetaService {
    private readonly loggerService;
    list: () => Promise<{
        id: string;
        symbol: string;
        strategyName: string;
        exchangeName: string;
        status: string;
    }[]>;
}

declare class BacktestMetaService {
    private readonly loggerService;
    list: () => Promise<{
        id: string;
        symbol: string;
        strategyName: string;
        exchangeName: string;
        frameName: string;
        status: string;
    }[]>;
}

declare const ioc: {
    notificationViewService: NotificationViewService;
    storageViewService: StorageViewService;
    exchangeViewService: ExchangeViewService;
    logViewService: LogViewService;
    statusViewService: StatusViewService;
    markdownViewService: MarkdownViewService;
    explorerViewService: ExplorerViewService;
    signalViewService: SignalViewService;
    heatViewService: HeatViewService;
    notificationMockService: NotificationMockService;
    storageMockService: StorageMockService;
    exchangeMockService: ExchangeMockService;
    logMockService: LogMockService;
    statusMockService: StatusMockService;
    markdownMockService: MarkdownMockService;
    explorerMockService: ExplorerMockService;
    signalMockService: SignalMockService;
    heatMockService: HeatMockService;
    liveMetaService: LiveMetaService;
    symbolMetaService: SymbolMetaService;
    backtestMetaService: BacktestMetaService;
    symbolConnectionService: SymbolConnectionService;
    priceConnectionService: PriceConnectionService;
    loggerService: LoggerService;
    exchangeService: ExchangeService;
};

export { type SymbolModel, getModulesPath, getPublicPath, getRouter, ioc as lib, serve, setLogger };
