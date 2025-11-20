import * as di_scoped from 'di-scoped';
import * as functools_kit from 'functools-kit';

interface IExecutionContext$1 {
    symbol: string;
    when: Date;
    backtest: boolean;
}
declare const ExecutionContextService: (new () => {
    readonly context: IExecutionContext$1;
}) & Omit<{
    new (context: IExecutionContext$1): {
        readonly context: IExecutionContext$1;
    };
}, "prototype"> & di_scoped.IScopedClassRun<[context: IExecutionContext$1]>;
type TExecutionContextService = InstanceType<typeof ExecutionContextService>;

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
    formatQuantity: (symbol: string, quantity: number) => Promise<string>;
    formatPrice: (symbol: string, price: number) => Promise<string>;
    getAveragePrice: (symbol: string) => Promise<number>;
}
type ExchangeName = string;

interface ISignalDto {
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
    exchangeName: ExchangeName;
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
    pnl: IStrategyPnL;
}
type IStrategyTickResult = IStrategyTickResultIdle | IStrategyTickResultOpened | IStrategyTickResultActive | IStrategyTickResultClosed;
interface IStrategy {
    tick: (symbol: string) => Promise<IStrategyTickResult>;
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

interface IExecutionContext {
    exchangeName: ExchangeName;
    strategyName: StrategyName;
    frameName: FrameName;
}
declare const MethodContextService: (new () => {
    readonly context: IExecutionContext;
}) & Omit<{
    new (context: IExecutionContext): {
        readonly context: IExecutionContext;
    };
}, "prototype"> & di_scoped.IScopedClassRun<[context: IExecutionContext]>;

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
    getCandles: (symbol: string, interval: CandleInterval, limit: number) => Promise<ICandleData[]>;
    getAveragePrice: (symbol: string) => Promise<number>;
    formatQuantity: (symbol: string, quantity: number) => Promise<string>;
    formatPrice: (symbol: string, price: number) => Promise<string>;
}

declare class ExchangeConnectionService implements IExchange {
    private readonly loggerService;
    private readonly executionContextService;
    private readonly exchangeSchemaService;
    private readonly methodContextService;
    getExchange: ((exchangeName: ExchangeName) => ClientExchange) & functools_kit.IClearableMemoize<string> & functools_kit.IControlMemoize<string, ClientExchange>;
    getCandles: (symbol: string, interval: CandleInterval, limit: number) => Promise<ICandleData[]>;
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
}

declare class ClientFrame implements IFrame {
    readonly params: IFrameParams;
    constructor(params: IFrameParams);
    getTimeframe: (symbol: string) => Promise<Date[]>;
}

declare class FrameConnectionService implements IFrame {
    private readonly loggerService;
    private readonly frameSchemaService;
    private readonly methodContextService;
    getFrame: ((frameName: FrameName) => ClientFrame) & functools_kit.IClearableMemoize<string> & functools_kit.IControlMemoize<string, ClientFrame>;
    getTimeframe: (symbol: string) => Promise<Date[]>;
}

declare class ExchangePublicService {
    private readonly loggerService;
    private readonly exchangeConnectionService;
    getCandles: (symbol: string, interval: CandleInterval, limit: number, when: Date, backtest: boolean) => Promise<ICandleData[]>;
    getAveragePrice: (symbol: string, when: Date, backtest: boolean) => Promise<number>;
    formatPrice: (symbol: string, price: number, when: Date, backtest: boolean) => Promise<string>;
    formatQuantity: (symbol: string, quantity: number, when: Date, backtest: boolean) => Promise<string>;
}

declare class StrategyPublicService {
    private readonly loggerService;
    private readonly strategyConnectionService;
    tick: (symbol: string, when: Date, backtest: boolean) => Promise<IStrategyTickResult>;
}

declare class FramePublicService {
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

declare class BacktestLogicService {
}

declare class LiveLogicService {
}

declare const backtest: {
    backtestLogicService: BacktestLogicService;
    liveLogicService: LiveLogicService;
    exchangePublicService: ExchangePublicService;
    strategyPublicService: StrategyPublicService;
    framePublicService: FramePublicService;
    exchangeSchemaService: ExchangeSchemaService;
    strategySchemaService: StrategySchemaService;
    frameSchemaService: FrameSchemaService;
    exchangeConnectionService: ExchangeConnectionService;
    strategyConnectionService: StrategyConnectionService;
    frameConnectionService: FrameConnectionService;
    executionContextService: {
        readonly context: IExecutionContext$1;
    };
    methodContextService: {
        readonly context: IExecutionContext;
    };
    loggerService: LoggerService;
};

export { type CandleInterval, ExecutionContextService, type FrameInterval, type ICandleData, type IExchangeSchema, type IFrameSchema, type ISignalDto, type ISignalRow, type IStrategyPnL, type IStrategySchema, type IStrategyTickResult, type IStrategyTickResultActive, type IStrategyTickResultClosed, type IStrategyTickResultIdle, type IStrategyTickResultOpened, MethodContextService, addExchange, addStrategy, backtest, formatPrice, formatQuantity, getAveragePrice, getCandles, reduce, runBacktest, runBacktestGUI, startRun, stopAll, stopRun };
