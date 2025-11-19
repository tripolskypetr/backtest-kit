import * as di_scoped from 'di-scoped';
import * as functools_kit from 'functools-kit';

interface IExecutionContext {
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
interface ICandleParams extends ICandleSchema {
    logger: ILogger;
    execution: TExecutionContextService;
}
interface ICandleCallbacks {
    onCandleData: (symbol: string, interval: CandleInterval, since: Date, limit: number, data: ICandleData[]) => void;
}
interface ICandleSchema {
    getCandles: (symbol: string, interval: CandleInterval, since: Date, limit: number) => Promise<ICandleData[]>;
    callbacks?: Partial<ICandleCallbacks>;
}
interface ICandle {
    getCandles: (symbol: string, interval: CandleInterval, limit: number) => Promise<ICandleData[]>;
    getAveragePrice: (symbol: string) => Promise<number>;
}

interface ISignalData {
    id: string;
    position: "long" | "short";
    note: string;
    priceOpen: number;
    priceTakeProfit: number;
    priceStopLoss: number;
    minuteEstimatedTime: number;
    timestamp: number;
}
interface IStrategyCallbacks {
    onOpen: (backtest: boolean, symbol: string, data: ISignalData) => void;
    onClose: (backtest: boolean, symbol: string, priceClose: number, data: ISignalData) => void;
}
interface IStrategySchema {
    getSignal: (symbol: string) => Promise<ISignalData | null>;
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
    signal: ISignalData;
}
interface IStrategyTickResultActive {
    action: "active";
    signal: ISignalData;
    currentPrice: number;
}
interface IStrategyTickResultClosed {
    action: "closed";
    signal: ISignalData;
    currentPrice: number;
    closeReason: StrategyCloseReason;
    pnl: IStrategyPnL;
}
type IStrategyTickResult = IStrategyTickResultIdle | IStrategyTickResultOpened | IStrategyTickResultActive | IStrategyTickResultClosed;
interface IStrategy {
    tick: (symbol: string) => Promise<IStrategyTickResult>;
}

declare function addStrategy(strategySchema: IStrategySchema): void;
declare function addCandle(candleSchema: ICandleSchema): void;

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

declare class LoggerService implements ILogger {
    private _commonLogger;
    log: (topic: string, ...args: any[]) => Promise<void>;
    debug: (topic: string, ...args: any[]) => Promise<void>;
    info: (topic: string, ...args: any[]) => Promise<void>;
    setLogger: (logger: ILogger) => void;
}

declare class ClientCandle implements ICandle {
    readonly params: ICandleParams;
    constructor(params: ICandleParams);
    getCandles: (symbol: string, interval: CandleInterval, limit: number) => Promise<ICandleData[]>;
    getAveragePrice: (symbol: string) => Promise<number>;
}

declare class CandleConnectionService implements ICandle {
    private readonly loggerService;
    private readonly executionContextService;
    private readonly candleSchemaService;
    getCandle: ((symbol: string) => ClientCandle) & functools_kit.IClearableMemoize<string> & functools_kit.IControlMemoize<string, ClientCandle>;
    getCandles: (symbol: string, interval: CandleInterval, limit: number) => Promise<ICandleData[]>;
    getAveragePrice: (symbol: string) => Promise<number>;
}

declare class CandleSchemaService {
    private readonly loggerService;
    private _candleSchema;
    getSchema: () => ICandleSchema;
    addSchema: (candleSchema: ICandleSchema) => void;
}

declare class StrategySchemaService {
    private readonly loggerService;
    private _strategySchema;
    getSchema: () => IStrategySchema;
    addSchema: (strategySchema: IStrategySchema) => void;
}

declare class StrategyConnectionService implements IStrategy {
    private readonly loggerService;
    private readonly executionContextService;
    private readonly strategySchemaService;
    private readonly candleConnectionService;
    private getStrategy;
    tick: (symbol: string) => Promise<IStrategyTickResult>;
}

declare class CandlePublicService {
    private readonly loggerService;
    private readonly candleConnectionService;
    getCandles: (symbol: string, interval: CandleInterval, limit: number, when: Date, backtest: boolean) => Promise<ICandleData[]>;
    getAveragePrice: (symbol: string, when: Date, backtest: boolean) => Promise<number>;
}

declare class StrategyPublicService {
    private readonly loggerService;
    private readonly strategyConnectionService;
    tick: (symbol: string, when: Date, backtest: boolean) => Promise<IStrategyTickResult>;
}

declare const backtest: {
    candlePublicService: CandlePublicService;
    strategyPublicService: StrategyPublicService;
    candleSchemaService: CandleSchemaService;
    strategySchemaService: StrategySchemaService;
    candleConnectionService: CandleConnectionService;
    strategyConnectionService: StrategyConnectionService;
    executionContextService: {
        readonly context: IExecutionContext;
    };
    loggerService: LoggerService;
};

export { ExecutionContextService, addCandle, addStrategy, backtest, reduce, runBacktest, runBacktestGUI, startRun, stopAll, stopRun };
