import * as functools_kit from 'functools-kit';
import { CandleInterval, TrailingTakeCommit, TrailingStopCommit, BreakevenCommit, PartialProfitCommit, PartialLossCommit, IStrategyTickResultScheduled, IStrategyTickResultCancelled, IStrategyTickResultOpened, IStrategyTickResultClosed, RiskContract } from 'backtest-kit';
import { Input } from 'telegraf';

interface ILogger {
    log(topic: string, ...args: any[]): void;
    debug(topic: string, ...args: any[]): void;
    info(topic: string, ...args: any[]): void;
    warn(topic: string, ...args: any[]): void;
}

declare class LoggerService implements ILogger {
    private _commonLogger;
    log: (topic: string, ...args: any[]) => Promise<void>;
    debug: (topic: string, ...args: any[]) => Promise<void>;
    info: (topic: string, ...args: any[]) => Promise<void>;
    warn: (topic: string, ...args: any[]) => Promise<void>;
    setLogger: (logger: ILogger) => void;
}

declare class PaperMainService {
    private loggerService;
    private resolveService;
    private exchangeSchemaService;
    private symbolSchemaService;
    private frontendProviderService;
    private telegramProviderService;
    run: ((payload: {
        entryPoint: string;
        symbol: string;
        strategy: string;
        exchange: string;
        verbose: boolean;
    }) => Promise<void>) & functools_kit.ISingleshotClearable;
    connect: (() => Promise<void>) & functools_kit.ISingleshotClearable;
}

declare class LiveMainService {
    private loggerService;
    private resolveService;
    private exchangeSchemaService;
    private symbolSchemaService;
    private frontendProviderService;
    private telegramProviderService;
    private liveProviderService;
    run: ((payload: {
        entryPoint: string;
        symbol: string;
        strategy: string;
        exchange: string;
        verbose: boolean;
    }) => Promise<void>) & functools_kit.ISingleshotClearable;
    connect: (() => Promise<void>) & functools_kit.ISingleshotClearable;
}

declare class BacktestMainService {
    private loggerService;
    private resolveService;
    private exchangeSchemaService;
    private frameSchemaService;
    private symbolSchemaService;
    private cacheLogicService;
    private frontendProviderService;
    private telegramProviderService;
    run: ((payload: {
        entryPoint: string;
        symbol: string;
        strategy: string;
        exchange: string;
        frame: string;
        cacheInterval: string[];
        verbose: boolean;
        noCache: boolean;
    }) => Promise<void>) & functools_kit.ISingleshotClearable;
    connect: (() => Promise<void>) & functools_kit.ISingleshotClearable;
}

declare class ExchangeSchemaService {
    readonly loggerService: LoggerService;
    addSchema: (() => Promise<void>) & functools_kit.ISingleshotClearable;
}

declare class FrameSchemaService {
    readonly loggerService: LoggerService;
    addSchema: (() => Promise<void>) & functools_kit.ISingleshotClearable;
}

declare class ResolveService {
    private readonly loggerService;
    readonly DEFAULT_TEMPLATE_DIR: string;
    readonly OVERRIDE_TEMPLATE_DIR: string;
    readonly OVERRIDE_MODULES_DIR: string;
    attachEntryPoint: (entryPoint: string) => Promise<void>;
}

declare class ErrorService {
    handleGlobalError: (error: Error) => Promise<void>;
    private _listenForError;
    protected init: (() => void) & functools_kit.ISingleshotClearable;
}

declare class SymbolSchemaService {
    readonly loggerService: LoggerService;
    addSchema: (() => Promise<void>) & functools_kit.ISingleshotClearable;
}

declare class FrontendProviderService {
    private readonly loggerService;
    enable: (() => () => void) & functools_kit.ISingleshotClearable;
    disable: () => void;
    connect: (() => Promise<() => void>) & functools_kit.ISingleshotClearable;
}

declare class TelegramProviderService {
    private readonly loggerService;
    private readonly telegramLogicService;
    enable: (() => () => void) & functools_kit.ISingleshotClearable;
    disable: () => void;
    connect: (() => Promise<() => void>) & functools_kit.ISingleshotClearable;
}

declare class CacheLogicService {
    private readonly loggerService;
    execute: (intervalList: CandleInterval[], dto: {
        symbol: string;
        frameName: string;
        exchangeName: string;
    }) => Promise<void>;
}

type InputFile = ReturnType<typeof Input.fromReadableStream>;
type Image = string | InputFile;
declare class TelegramApiService {
    publish: (channel: string, msg: string, images?: Image[]) => Promise<"Message scheduled for publication" | "Message published successfully">;
}

declare class QuickchartApiService {
    readonly loggerService: LoggerService;
    getChart: (symbol: string, interval: string) => Promise<Buffer<ArrayBufferLike>>;
}

declare class TelegramWebService {
    private readonly loggerService;
    private readonly telegramApiService;
    private readonly quickchartApiService;
    publishNotify: (dto: {
        symbol: string;
        markdown: string;
    }) => Promise<void>;
}

declare class TelegramLogicService {
    private readonly loggerService;
    private readonly telegramTemplateService;
    private readonly telegramWebService;
    private notifyTrailingTake;
    private notifyTrailingStop;
    private notifyBreakeven;
    private notifyPartialProfit;
    private notifyPartialLoss;
    private notifyScheduled;
    private notifyCancelled;
    private notifyOpened;
    private notifyClosed;
    private notifyRisk;
    connect: (() => () => void) & functools_kit.ISingleshotClearable;
}

declare class TelegramTemplateService {
    readonly loggerService: LoggerService;
    readonly resolveService: ResolveService;
    getTrailingTakeMarkdown: (event: TrailingTakeCommit) => Promise<string>;
    getTrailingStopMarkdown: (event: TrailingStopCommit) => Promise<string>;
    getBreakevenMarkdown: (event: BreakevenCommit) => Promise<string>;
    getPartialProfitMarkdown: (event: PartialProfitCommit) => Promise<string>;
    getPartialLossMarkdown: (event: PartialLossCommit) => Promise<string>;
    getScheduledMarkdown: (event: IStrategyTickResultScheduled) => Promise<string>;
    getCancelledMarkdown: (event: IStrategyTickResultCancelled) => Promise<string>;
    getOpenedMarkdown: (event: IStrategyTickResultOpened) => Promise<string>;
    getClosedMarkdown: (event: IStrategyTickResultClosed) => Promise<string>;
    getRiskMarkdown: (event: RiskContract) => Promise<string>;
}

interface ILiveModule {
    onTrailingTake(event: TrailingTakeCommit): Promise<void> | void;
    onTrailingStop(event: TrailingStopCommit): Promise<void> | void;
    onBreakeven(event: BreakevenCommit): Promise<void> | void;
    onPartialProfit(event: PartialProfitCommit): Promise<void> | void;
    onPartialLoss(event: PartialLossCommit): Promise<void> | void;
    onScheduled(event: IStrategyTickResultScheduled): Promise<void> | void;
    onCancelled(event: IStrategyTickResultCancelled): Promise<void> | void;
    onOpened(event: IStrategyTickResultOpened): Promise<void> | void;
    onClosed(event: IStrategyTickResultClosed): Promise<void> | void;
    onRisk(event: RiskContract): Promise<void> | void;
}
type LiveModule = Partial<ILiveModule>;
type BaseModule = LiveModule;
type TBaseModuleCtor = new () => BaseModule;

declare class ModuleConnectionService {
    readonly loggerService: LoggerService;
    readonly resolveService: ResolveService;
    getInstance: ((fileName: string) => Promise<BaseModule>) & functools_kit.IClearableMemoize<string> & functools_kit.IControlMemoize<string, Promise<Partial<ILiveModule>>>;
}

declare class LiveProviderService {
    readonly loggerService: LoggerService;
    readonly moduleConnectionService: ModuleConnectionService;
    private handleTrailingTake;
    private handleTrailingStop;
    private handleBreakeven;
    private handlePartialProfit;
    private handlePartialLoss;
    private handleScheduled;
    private handleCancelled;
    private handleOpened;
    private handleClosed;
    private handleRisk;
    enable: (() => (...args: any[]) => any) & functools_kit.ISingleshotClearable;
    disable: () => void;
    connect: (() => Promise<() => void>) & functools_kit.ISingleshotClearable;
}

declare const cli: {
    telegramTemplateService: TelegramTemplateService;
    telegramWebService: TelegramWebService;
    frontendProviderService: FrontendProviderService;
    telegramProviderService: TelegramProviderService;
    liveProviderService: LiveProviderService;
    exchangeSchemaService: ExchangeSchemaService;
    symbolSchemaService: SymbolSchemaService;
    frameSchemaService: FrameSchemaService;
    cacheLogicService: CacheLogicService;
    telegramLogicService: TelegramLogicService;
    backtestMainService: BacktestMainService;
    paperMainService: PaperMainService;
    liveMainService: LiveMainService;
    moduleConnectionService: ModuleConnectionService;
    errorService: ErrorService;
    loggerService: LoggerService;
    resolveService: ResolveService;
    telegramApiService: TelegramApiService;
    quickchartApiService: QuickchartApiService;
};

declare enum ExchangeName {
    DefaultExchange = "default_exchange"
}

declare enum FrameName {
    DefaultFrame = "default_frame"
}

declare function setLogger(logger: ILogger): void;

type PayloadBacktest = Parameters<typeof cli.backtestMainService.run>[0];
type PayloadPaper = Parameters<typeof cli.paperMainService.run>[0];
type PayloadLive = Parameters<typeof cli.liveMainService.run>[0];
type Mode = "backtest" | "live" | "paper";
type Args = Partial<PayloadBacktest> | Partial<PayloadPaper> | Partial<PayloadLive>;
declare function run(mode: Mode, args: Args): Promise<void>;

export { type BaseModule, ExchangeName, FrameName, type ILiveModule, type ILogger, type LiveModule, type TBaseModuleCtor, cli, run, setLogger };
