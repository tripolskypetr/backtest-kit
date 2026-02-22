import * as functools_kit from 'functools-kit';
import { Input } from 'telegraf';
import { TrailingTakeCommit, TrailingStopCommit, BreakevenCommit, PartialProfitCommit, PartialLossCommit, IStrategyTickResultScheduled, IStrategyTickResultCancelled, IStrategyTickResultOpened, IStrategyTickResultClosed, RiskContract } from 'backtest-kit';

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
    private exchangeSchemaService;
    private resolveService;
    private frontendProviderService;
    private telegramProviderService;
    protected init: (() => Promise<void>) & functools_kit.ISingleshotClearable;
}

declare class LiveMainService {
    private loggerService;
    private exchangeSchemaService;
    private resolveService;
    private frontendProviderService;
    private telegramProviderService;
    protected init: (() => Promise<void>) & functools_kit.ISingleshotClearable;
}

declare class BacktestMainService {
    private loggerService;
    private exchangeSchemaService;
    private frameSchemaService;
    private cacheLogicService;
    private resolveService;
    private frontendProviderService;
    private telegramProviderService;
    protected init: (() => Promise<void>) & functools_kit.ISingleshotClearable;
}

declare class ExchangeSchemaService {
    readonly loggerService: LoggerService;
    init: (() => Promise<void>) & functools_kit.ISingleshotClearable;
}

declare class FrameSchemaService {
    readonly loggerService: LoggerService;
    init: (() => Promise<void>) & functools_kit.ISingleshotClearable;
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
    protected init: () => void;
}

declare class SymbolSchemaService {
    readonly loggerService: LoggerService;
    init: (() => Promise<void>) & functools_kit.ISingleshotClearable;
}

declare class FrontendProviderService {
    private readonly loggerService;
    enable: (() => () => void) & functools_kit.ISingleshotClearable;
    disable: () => void;
    init: (() => Promise<void>) & functools_kit.ISingleshotClearable;
}

declare class TelegramProviderService {
    private readonly loggerService;
    private readonly telegramLogicService;
    enable: (() => () => void) & functools_kit.ISingleshotClearable;
    disable: () => void;
    init: (() => Promise<void>) & functools_kit.ISingleshotClearable;
}

declare class CacheLogicService {
    private readonly loggerService;
    execute: (dto: {
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

declare class LiveConnectionService {
}

declare const cli: {
    telegramTemplateService: TelegramTemplateService;
    telegramWebService: TelegramWebService;
    frontendProviderService: FrontendProviderService;
    telegramProviderService: TelegramProviderService;
    exchangeSchemaService: ExchangeSchemaService;
    symbolSchemaService: SymbolSchemaService;
    frameSchemaService: FrameSchemaService;
    cacheLogicService: CacheLogicService;
    telegramLogicService: TelegramLogicService;
    backtestMainService: BacktestMainService;
    paperMainService: PaperMainService;
    liveMainService: LiveMainService;
    liveConnectionService: LiveConnectionService;
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

export { ExchangeName, FrameName, cli, setLogger };
