import { CandleInterval, ISignalDto } from 'backtest-kit';

declare class Code {
    readonly source: string;
    private readonly __type__;
    private constructor();
    static fromString: (source: string) => Code;
    static isCode: (value: unknown) => value is Code;
}

declare class File {
    readonly path: string;
    readonly baseDir: string;
    private readonly __type__;
    private constructor();
    static fromPath: (path: string, baseDir?: string) => File;
    static isFile: (value: unknown) => value is File;
}

type PlotData = {
    time: number;
    value: number;
};
type PlotEntry = {
    data: PlotData[];
};
type PlotModel = Record<string, PlotEntry>;
type PlotRecord = {
    plots: PlotModel;
};

interface IProvider {
    getMarketData(tickerId: string, timeframe: string, limit?: number, sDate?: number, eDate?: number): Promise<any>;
    getSymbolInfo(tickerId: string): Promise<any>;
}

type TPineCtor = (source: IProvider, tickerId: string, timeframe: string, limit: number) => IPine;
interface IPine {
    ready(): Promise<void>;
    run(code: string): Promise<PlotRecord>;
}

declare function usePine<T = TPineCtor>(ctor: T): void;

interface IRunParams {
    symbol: string;
    timeframe: CandleInterval;
    limit: number;
}
declare function run(source: File | Code, { symbol, timeframe, limit }: IRunParams): Promise<PlotModel>;

type PlotExtractConfig<T = number> = {
    plot: string;
    barsBack?: number;
    transform?: (value: number) => T;
};
type PlotMapping = {
    [key: string]: string | PlotExtractConfig<any>;
};
type ExtractedData<M extends PlotMapping> = {
    [K in keyof M]: M[K] extends PlotExtractConfig<infer R> ? R : M[K] extends string ? number : never;
};
declare class PineDataService {
    private readonly loggerService;
    extract<M extends PlotMapping>(plots: PlotModel, mapping: M): ExtractedData<M>;
}

declare function extract<M extends PlotMapping>(plots: PlotModel, mapping: M): Promise<ExtractedData<M>>;

interface ILogger {
    log(topic: string, ...args: any[]): void;
    debug(topic: string, ...args: any[]): void;
    info(topic: string, ...args: any[]): void;
    warn(topic: string, ...args: any[]): void;
}

declare function setLogger(logger: ILogger): void;

interface IParams {
    symbol: string;
    timeframe: CandleInterval;
    limit: number;
}
declare function getSignal(source: File | Code, { symbol, timeframe, limit }: IParams): Promise<ISignalDto | null>;

type ResultId$1 = string | number;
declare function dumpPlotData(signalId: ResultId$1, plots: PlotModel, taName: string, outputDir?: string): Promise<void>;

interface SignalData {
    position: number;
    priceOpen: number;
    priceTakeProfit: number;
    priceStopLoss: number;
    minuteEstimatedTime: number;
}
interface Signal extends ISignalDto {
    id: string;
}
declare function toSignalDto(data: SignalData): Signal | null;

interface CandleModel {
    openTime: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
}

interface SymbolInfoModel {
    ticker: string;
    tickerid: string;
    description: string;
    type: string;
    basecurrency: string;
    currency: string;
    timezone: string;
}

declare const AXIS_SYMBOL = "_AXIS";
declare class AxisProviderService implements IProvider {
    private readonly loggerService;
    getMarketData(_: string, timeframe: string, limit?: number, sDate?: number, eDate?: number): Promise<any[]>;
    getSymbolInfo(): Promise<any>;
}

declare class LoggerService implements ILogger {
    private _commonLogger;
    log: (topic: string, ...args: any[]) => Promise<void>;
    debug: (topic: string, ...args: any[]) => Promise<void>;
    info: (topic: string, ...args: any[]) => Promise<void>;
    warn: (topic: string, ...args: any[]) => Promise<void>;
    setLogger: (logger: ILogger) => void;
}

declare class CandleProviderService implements IProvider {
    private readonly loggerService;
    getMarketData(tickerId: string, timeframe: string, limit?: number, sDate?: number, eDate?: number): Promise<any[]>;
    getSymbolInfo(tickerId: string): Promise<any>;
}

declare class PineConnectionService {
    private readonly loggerService;
    private PineFactory;
    getInstance: (...args: Parameters<TPineCtor>) => Promise<IPine>;
    usePine: (ctor: TPineCtor) => void;
    clear: () => void;
}

declare class PineJobService {
    readonly loggerService: LoggerService;
    readonly axisProviderService: AxisProviderService;
    readonly candleProviderService: CandleProviderService;
    readonly pineConnectionService: PineConnectionService;
    run: (code: Code, tickerId: string, timeframe?: CandleInterval, limit?: number) => Promise<PlotRecord>;
}

declare class PineCacheService {
    private readonly loggerService;
    readFile: (path: string, baseDir?: string) => Promise<string>;
    clear: (path?: string, baseDir?: string) => Promise<void>;
}

type ResultId = string | number;
interface IPlotRow {
    time: number;
    [key: string]: number | null;
}
declare class PineMarkdownService {
    private readonly loggerService;
    getData: (plots: PlotModel) => IPlotRow[];
    getReport: (signalId: ResultId, plots: PlotModel) => string;
    dump: (signalId: ResultId, plots: PlotModel, taName: string, outputDir?: string) => Promise<void>;
}

declare const pine: {
    pineMarkdownService: PineMarkdownService;
    pineConnectionService: PineConnectionService;
    pineCacheService: PineCacheService;
    pineDataService: PineDataService;
    pineJobService: PineJobService;
    axisProviderService: AxisProviderService;
    candleProviderService: CandleProviderService;
    loggerService: LoggerService;
};

export { AXIS_SYMBOL, type CandleModel, Code, File, type ILogger, type IPine, type IProvider, type PlotExtractConfig, type PlotMapping, type PlotModel, type PlotRecord, type SymbolInfoModel, type TPineCtor, dumpPlotData, extract, getSignal, pine as lib, run, setLogger, toSignalDto, usePine };
