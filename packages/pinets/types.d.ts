import { CandleInterval } from 'backtest-kit';
import { Code as Code$1 } from 'src/classes/Code';
import { File as File$1 } from 'src/classes/File';
import { PlotMapping as PlotMapping$1, ExtractedData as ExtractedData$1 } from 'src/lib/services/data/PineDataService';
import { PlotModel as PlotModel$1 } from 'src/model/Plot.model';
import { IProvider } from 'src/interface/Provider.interface';
import * as pinets from 'pinets';

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

interface IRunParams<M extends PlotMapping$1> {
    symbol: string;
    timeframe: CandleInterval;
    limit: number;
    mapping: M;
}
declare function run<M extends PlotMapping$1>(source: File$1 | Code$1, { symbol, timeframe, mapping, limit }: IRunParams<M>): Promise<ExtractedData$1<M>>;

interface ILogger {
    log(topic: string, ...args: any[]): void;
    debug(topic: string, ...args: any[]): void;
    info(topic: string, ...args: any[]): void;
    warn(topic: string, ...args: any[]): void;
}

declare function setLogger(logger: ILogger): void;

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
    extract<M extends PlotMapping>(plots: PlotModel$1, mapping: M): ExtractedData<M>;
}

interface CandleModel {
    openTime: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
}

type PlotData = {
    time: number;
    value: number;
};
type PlotEntry = {
    data: PlotData[];
};
type PlotModel = Record<string, PlotEntry>;

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

declare class PineJobService {
    readonly loggerService: LoggerService;
    readonly axisProviderService: AxisProviderService;
    readonly candleProviderService: CandleProviderService;
    run: (script: string | Function, tickerId: string, timeframe?: string, limit?: number) => Promise<pinets.Context>;
}

declare class PineCacheService {
    private readonly loggerService;
    readFile: (path: string, baseDir?: string) => Promise<string>;
    clear: (path?: string, baseDir?: string) => Promise<void>;
}

declare const pine: {
    pineCacheService: PineCacheService;
    pineDataService: PineDataService;
    pineJobService: PineJobService;
    axisProviderService: AxisProviderService;
    candleProviderService: CandleProviderService;
    loggerService: LoggerService;
};

export { AXIS_SYMBOL, type CandleModel, Code, File, type PlotExtractConfig, type PlotMapping, type PlotModel, type SymbolInfoModel, pine as lib, run, setLogger };
