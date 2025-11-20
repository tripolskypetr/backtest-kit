import * as di_scoped from 'di-scoped';
import * as functools_kit from 'functools-kit';

/**
 * Interface representing a logging mechanism for the swarm system.
 * Provides methods to record messages at different severity levels, used across components like agents, sessions, states, storage, swarms, history, embeddings, completions, and policies.
 * Logs are utilized to track lifecycle events (e.g., initialization, disposal), operational details (e.g., tool calls, message emissions), validation outcomes (e.g., policy checks), and errors (e.g., persistence failures), aiding in debugging, monitoring, and auditing.
*/
interface ILogger {
    /**
     * Logs a general-purpose message.
     * Used throughout the swarm system to record significant events or state changes, such as agent execution, session connections, or storage updates.
     */
    log(topic: string, ...args: any[]): void;
    /**
     * Logs a debug-level message.
     * Employed for detailed diagnostic information, such as intermediate states during agent tool calls, swarm navigation changes, or embedding creation processes, typically enabled in development or troubleshooting scenarios.
     */
    debug(topic: string, ...args: any[]): void;
    /**
     * Logs an info-level message.
     * Used to record informational updates, such as successful completions, policy validations, or history commits, providing a high-level overview of system activity without excessive detail.
     */
    info(topic: string, ...args: any[]): void;
}

declare function setLogger(logger: ILogger): Promise<void>;

interface IExecutionContext {
    symbol: string;
    when: Date;
    backtest: boolean;
}
declare const ExecutionContextService: (new () => {
    readonly context: IExecutionContext;
}) & Omit<{
    new (context: IExecutionContext): {
        readonly context: IExecutionContext;
    };
}, "prototype"> & di_scoped.IScopedClassRun<[context: IExecutionContext]>;
type TExecutionContextService = InstanceType<typeof ExecutionContextService>;

type CandleInterval = "1m" | "3m" | "5m" | "15m" | "30m" | "1h" | "2h" | "4h" | "6h" | "8h";
interface ICandleData {
    timestamp: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
}
interface IExchangeParams extends IExchangeSchema {
    logger: ILogger;
    execution: TExecutionContextService;
}
interface IExchangeCallbacks {
    onCandleData: (symbol: string, interval: CandleInterval, since: Date, limit: number, data: ICandleData[]) => void;
}
interface IExchangeSchema {
    exchangeName: ExchangeName;
    getCandles: (symbol: string, interval: CandleInterval, since: Date, limit: number) => Promise<ICandleData[]>;
    formatQuantity: (symbol: string, quantity: number) => Promise<string>;
    formatPrice: (symbol: string, price: number) => Promise<string>;
    callbacks?: Partial<IExchangeCallbacks>;
}
interface IExchange {
    getCandles: (symbol: string, interval: CandleInterval, limit: number) => Promise<ICandleData[]>;
    getNextCandles: (symbol: string, interval: CandleInterval, limit: number) => Promise<ICandleData[]>;
    formatQuantity: (symbol: string, quantity: number) => Promise<string>;
    formatPrice: (symbol: string, price: number) => Promise<string>;
    getAveragePrice: (symbol: string) => Promise<number>;
}
type ExchangeName = string;

type SignalInterval = "1m" | "3m" | "5m" | "15m" | "30m" | "1h";
interface ISignalDto {
    id?: string;
    position: "long" | "short";
    note: string;
    priceOpen: number;
    priceTakeProfit: number;
    priceStopLoss: number;
    minuteEstimatedTime: number;
    timestamp: number;
}
interface ISignalRow extends ISignalDto {
    id: string;
}
interface IStrategyCallbacks {
    onOpen: (backtest: boolean, symbol: string, data: ISignalRow) => void;
    onClose: (backtest: boolean, symbol: string, priceClose: number, data: ISignalRow) => void;
}
interface IStrategySchema {
    strategyName: StrategyName;
    interval: SignalInterval;
    getSignal: (symbol: string) => Promise<ISignalDto | null>;
    callbacks?: Partial<IStrategyCallbacks>;
}
type StrategyCloseReason = "time_expired" | "take_profit" | "stop_loss";
interface IStrategyPnL {
    pnlPercentage: number;
    priceOpen: number;
    priceClose: number;
}
interface IStrategyTickResultIdle {
    action: "idle";
    signal: null;
}
interface IStrategyTickResultOpened {
    action: "opened";
    signal: ISignalRow;
}
interface IStrategyTickResultActive {
    action: "active";
    signal: ISignalRow;
    currentPrice: number;
}
interface IStrategyTickResultClosed {
    action: "closed";
    signal: ISignalRow;
    currentPrice: number;
    closeReason: StrategyCloseReason;
    closeTimestamp: number;
    pnl: IStrategyPnL;
}
type IStrategyTickResult = IStrategyTickResultIdle | IStrategyTickResultOpened | IStrategyTickResultActive | IStrategyTickResultClosed;
type IStrategyBacktestResult = IStrategyTickResultClosed;
interface IStrategy {
    tick: (symbol: string) => Promise<IStrategyTickResult>;
    backtest: (candles: ICandleData[]) => Promise<IStrategyBacktestResult>;
}
type StrategyName = string;

type FrameInterval = "1m" | "3m" | "5m" | "15m" | "30m" | "1h" | "2h" | "4h" | "6h" | "8h" | "12h" | "1d" | "3d";
interface IFrameParams extends IFrameSchema {
    logger: ILogger;
}
interface IFrameCallbacks {
    onTimeframe: (timeframe: Date[], startDate: Date, endDate: Date, interval: FrameInterval) => void;
}
interface IFrameSchema {
    frameName: FrameName;
    interval: FrameInterval;
    startDate: Date;
    endDate: Date;
    callbacks?: Partial<IFrameCallbacks>;
}
interface IFrame {
    getTimeframe: (symbol: string) => Promise<Date[]>;
}
type FrameName = string;

declare function addStrategy(strategySchema: IStrategySchema): void;
declare function addExchange(exchangeSchema: IExchangeSchema): void;
declare function addFrame(frameSchema: IFrameSchema): void;

interface IBacktestResult {
    symbol: string;
    results: IStrategyTickResult[];
}
declare function runBacktest(symbol: string, timeframes: Date[]): Promise<IBacktestResult>;
declare function runBacktestGUI(symbol: string, timeframes: Date[]): Promise<void>;

interface IReduceResult<T> {
    symbol: string;
    accumulator: T;
    totalTicks: number;
}
type ReduceCallback<T> = (accumulator: T, index: number, when: Date, symbol: string) => T | Promise<T>;
declare function reduce<T>(symbol: string, timeframes: Date[], callback: ReduceCallback<T>, initialValue: T): Promise<IReduceResult<T>>;

interface IRunConfig {
    symbol: string;
    interval: number;
}
declare function startRun(config: IRunConfig): void;
declare function stopRun(symbol: string): void;
declare function stopAll(): void;

declare function getCandles(symbol: string, interval: CandleInterval, limit: number): Promise<ICandleData[]>;
declare function getAveragePrice(symbol: string): Promise<number>;
declare function formatPrice(symbol: string, price: number): Promise<string>;
declare function formatQuantity(symbol: string, quantity: number): Promise<string>;
declare function getDate(): Promise<Date>;
declare function getMode(): Promise<"backtest" | "live">;

interface IMethodContext {
    exchangeName: ExchangeName;
    strategyName: StrategyName;
    frameName: FrameName;
}
declare const MethodContextService: (new () => {
    readonly context: IMethodContext;
}) & Omit<{
    new (context: IMethodContext): {
        readonly context: IMethodContext;
    };
}, "prototype"> & di_scoped.IScopedClassRun<[context: IMethodContext]>;

declare const BASE_WAIT_FOR_INIT_SYMBOL: unique symbol;
interface ISignalData {
    signalRow: ISignalRow | null;
}
type TPersistBase = InstanceType<typeof PersistBase>;
type TPersistBaseCtor<EntityName extends string = string, Entity extends IEntity = IEntity> = new (entityName: EntityName, baseDir: string) => IPersistBase<Entity>;
type EntityId = string | number;
interface IEntity {
}
interface IPersistBase<Entity extends IEntity = IEntity> {
    waitForInit(initial: boolean): Promise<void>;
    readValue(entityId: EntityId): Promise<Entity>;
    hasValue(entityId: EntityId): Promise<boolean>;
    writeValue(entityId: EntityId, entity: Entity): Promise<void>;
}
declare const PersistBase: {
    new <EntityName extends string = string>(entityName: EntityName, baseDir?: string): {
        _directory: string;
        readonly entityName: EntityName;
        readonly baseDir: string;
        _getFilePath(entityId: EntityId): string;
        waitForInit(initial: boolean): Promise<void>;
        getCount(): Promise<number>;
        readValue<T extends IEntity = IEntity>(entityId: EntityId): Promise<T>;
        hasValue(entityId: EntityId): Promise<boolean>;
        writeValue<T extends IEntity = IEntity>(entityId: EntityId, entity: T): Promise<void>;
        removeValue(entityId: EntityId): Promise<void>;
        removeAll(): Promise<void>;
        values<T extends IEntity = IEntity>(): AsyncGenerator<T>;
        keys(): AsyncGenerator<EntityId>;
        filter<T extends IEntity = IEntity>(predicate: (value: T) => boolean): AsyncGenerator<T>;
        take<T extends IEntity = IEntity>(total: number, predicate?: (value: T) => boolean): AsyncGenerator<T>;
        [BASE_WAIT_FOR_INIT_SYMBOL]: (() => Promise<void>) & functools_kit.ISingleshotClearable;
        [Symbol.asyncIterator](): AsyncIterableIterator<any>;
    };
};
declare class PersistSignalUtils {
    private PersistSignalFactory;
    private getSignalStorage;
    usePersistSignalAdapter(Ctor: TPersistBaseCtor<StrategyName, ISignalData>): void;
    readSignalData: (strategyName: StrategyName, symbol: string) => Promise<ISignalRow | null>;
    writeSignalData: (signalRow: ISignalRow | null, strategyName: StrategyName, symbol: string) => Promise<void>;
}
declare const PersistSignalAdaper: PersistSignalUtils;

declare class BacktestUtils {
    run: (symbol: string, context: {
        strategyName: string;
        exchangeName: string;
        frameName: string;
    }) => AsyncGenerator<IStrategyTickResultClosed, void, unknown>;
}
declare const Backtest: BacktestUtils;

declare class LiveUtils {
    run: (symbol: string, context: {
        strategyName: string;
        exchangeName: string;
        frameName: string;
    }) => AsyncGenerator<IStrategyTickResultOpened | IStrategyTickResultClosed, void, unknown>;
}
declare const Live: LiveUtils;

declare class LoggerService implements ILogger {
    private readonly methodContextService;
    private readonly executionContextService;
    private _commonLogger;
    private get methodContext();
    private get executionContext();
    log: (topic: string, ...args: any[]) => Promise<void>;
    debug: (topic: string, ...args: any[]) => Promise<void>;
    info: (topic: string, ...args: any[]) => Promise<void>;
    setLogger: (logger: ILogger) => void;
}

declare class ClientExchange implements IExchange {
    readonly params: IExchangeParams;
    constructor(params: IExchangeParams);
    getCandles(symbol: string, interval: CandleInterval, limit: number): Promise<ICandleData[]>;
    getNextCandles(symbol: string, interval: CandleInterval, limit: number): Promise<ICandleData[]>;
    getAveragePrice(symbol: string): Promise<number>;
    formatQuantity(symbol: string, quantity: number): Promise<string>;
    formatPrice(symbol: string, price: number): Promise<string>;
}

declare class ExchangeConnectionService implements IExchange {
    private readonly loggerService;
    private readonly executionContextService;
    private readonly exchangeSchemaService;
    private readonly methodContextService;
    getExchange: ((exchangeName: ExchangeName) => ClientExchange) & functools_kit.IClearableMemoize<string> & functools_kit.IControlMemoize<string, ClientExchange>;
    getCandles: (symbol: string, interval: CandleInterval, limit: number) => Promise<ICandleData[]>;
    getNextCandles: (symbol: string, interval: CandleInterval, limit: number) => Promise<ICandleData[]>;
    getAveragePrice: (symbol: string) => Promise<number>;
    formatPrice: (symbol: string, price: number) => Promise<string>;
    formatQuantity: (symbol: string, quantity: number) => Promise<string>;
}

declare class StrategyConnectionService implements IStrategy {
    private readonly loggerService;
    private readonly executionContextService;
    private readonly strategySchemaService;
    private readonly exchangeConnectionService;
    private readonly methodContextService;
    private getStrategy;
    tick: () => Promise<IStrategyTickResult>;
    backtest: (candles: ICandleData[]) => Promise<IStrategyBacktestResult>;
}

declare class ClientFrame implements IFrame {
    readonly params: IFrameParams;
    constructor(params: IFrameParams);
    getTimeframe: ((symbol: string) => Promise<Date[]>) & functools_kit.ISingleshotClearable;
}

declare class FrameConnectionService implements IFrame {
    private readonly loggerService;
    private readonly frameSchemaService;
    private readonly methodContextService;
    getFrame: ((frameName: FrameName) => ClientFrame) & functools_kit.IClearableMemoize<string> & functools_kit.IControlMemoize<string, ClientFrame>;
    getTimeframe: (symbol: string) => Promise<Date[]>;
}

declare class ExchangeGlobalService {
    private readonly loggerService;
    private readonly exchangeConnectionService;
    getCandles: (symbol: string, interval: CandleInterval, limit: number, when: Date, backtest: boolean) => Promise<ICandleData[]>;
    getNextCandles: (symbol: string, interval: CandleInterval, limit: number, when: Date, backtest: boolean) => Promise<ICandleData[]>;
    getAveragePrice: (symbol: string, when: Date, backtest: boolean) => Promise<number>;
    formatPrice: (symbol: string, price: number, when: Date, backtest: boolean) => Promise<string>;
    formatQuantity: (symbol: string, quantity: number, when: Date, backtest: boolean) => Promise<string>;
}

declare class StrategyGlobalService {
    private readonly loggerService;
    private readonly strategyConnectionService;
    tick: (symbol: string, when: Date, backtest: boolean) => Promise<IStrategyTickResult>;
    backtest: (symbol: string, candles: ICandleData[], when: Date, backtest: boolean) => Promise<IStrategyBacktestResult>;
}

declare class FrameGlobalService {
    private readonly loggerService;
    private readonly frameConnectionService;
    getTimeframe: (symbol: string) => Promise<Date[]>;
}

declare class ExchangeSchemaService {
    readonly loggerService: LoggerService;
    private _registry;
    register: (key: ExchangeName, value: IExchangeSchema) => void;
    override: (key: ExchangeName, value: Partial<IExchangeSchema>) => IExchangeSchema;
    get: (key: ExchangeName) => IExchangeSchema;
}

declare class StrategySchemaService {
    readonly loggerService: LoggerService;
    private _registry;
    register: (key: StrategyName, value: IStrategySchema) => void;
    override: (key: StrategyName, value: Partial<IStrategySchema>) => IStrategySchema;
    get: (key: StrategyName) => IStrategySchema;
}

declare class FrameSchemaService {
    private _registry;
    register(key: FrameName, value: IFrameSchema): void;
    override(key: FrameName, value: Partial<IFrameSchema>): void;
    get(key: FrameName): IFrameSchema;
}

declare class BacktestLogicPrivateService {
    private readonly loggerService;
    private readonly strategyGlobalService;
    private readonly exchangeGlobalService;
    private readonly frameGlobalService;
    run(symbol: string): AsyncGenerator<IStrategyTickResultClosed, void, unknown>;
}

declare class LiveLogicPrivateService {
    private readonly loggerService;
    private readonly strategyGlobalService;
    run(symbol: string): AsyncGenerator<IStrategyTickResultOpened | IStrategyTickResultClosed, void, unknown>;
}

declare class BacktestLogicPublicService {
    private readonly loggerService;
    private readonly backtestLogicPrivateService;
    run: (symbol: string, context: {
        strategyName: string;
        exchangeName: string;
        frameName: string;
    }) => AsyncGenerator<IStrategyTickResultClosed, void, unknown>;
}

declare class LiveLogicPublicService {
    private readonly loggerService;
    private readonly liveLogicPrivateService;
    run: (symbol: string, context: {
        strategyName: string;
        exchangeName: string;
    }) => AsyncGenerator<IStrategyTickResultOpened | IStrategyTickResultClosed, void, unknown>;
}

declare class LiveGlobalService {
    private readonly loggerService;
    private readonly liveLogicPublicService;
    run: (symbol: string, context: {
        strategyName: string;
        exchangeName: string;
    }) => AsyncGenerator<IStrategyTickResultOpened | IStrategyTickResultClosed, void, unknown>;
}

declare class BacktestGlobalService {
    private readonly loggerService;
    private readonly backtestLogicPublicService;
    run: (symbol: string, context: {
        strategyName: string;
        exchangeName: string;
        frameName: string;
    }) => AsyncGenerator<IStrategyTickResultClosed, void, unknown>;
}

declare const backtest: {
    backtestLogicPublicService: BacktestLogicPublicService;
    liveLogicPublicService: LiveLogicPublicService;
    backtestLogicPrivateService: BacktestLogicPrivateService;
    liveLogicPrivateService: LiveLogicPrivateService;
    exchangeGlobalService: ExchangeGlobalService;
    strategyGlobalService: StrategyGlobalService;
    frameGlobalService: FrameGlobalService;
    liveGlobalService: LiveGlobalService;
    backtestGlobalService: BacktestGlobalService;
    exchangeSchemaService: ExchangeSchemaService;
    strategySchemaService: StrategySchemaService;
    frameSchemaService: FrameSchemaService;
    exchangeConnectionService: ExchangeConnectionService;
    strategyConnectionService: StrategyConnectionService;
    frameConnectionService: FrameConnectionService;
    executionContextService: {
        readonly context: IExecutionContext;
    };
    methodContextService: {
        readonly context: IMethodContext;
    };
    loggerService: LoggerService;
};

export { Backtest, type CandleInterval, ExecutionContextService, type FrameInterval, type ICandleData, type IExchangeSchema, type IFrameSchema, type IPersistBase, type ISignalDto, type ISignalRow, type IStrategyPnL, type IStrategySchema, type IStrategyTickResult, type IStrategyTickResultActive, type IStrategyTickResultClosed, type IStrategyTickResultIdle, type IStrategyTickResultOpened, Live, MethodContextService, PersistBase, PersistSignalAdaper, type SignalInterval, type TPersistBase, type TPersistBaseCtor, addExchange, addFrame, addStrategy, backtest, formatPrice, formatQuantity, getAveragePrice, getCandles, getDate, getMode, reduce, runBacktest, runBacktestGUI, setLogger, startRun, stopAll, stopRun };
