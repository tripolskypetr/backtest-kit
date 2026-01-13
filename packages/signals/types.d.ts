import { IBaseMessage, IOutlineHistory } from 'agent-swarm-kit';
import { ICandleData } from 'backtest-kit';

type HistoryContract = IBaseMessage[] | IOutlineHistory;

type ReportFn = (symbol: string, history: HistoryContract) => Promise<void>;

declare const commitHourHistory: ReportFn;
declare const commitThirtyMinuteHistory: ReportFn;
declare const commitFifteenMinuteHistory: ReportFn;
declare const commitOneMinuteHistory: ReportFn;

declare const commitMicroTermMath: ReportFn;
declare const commitLongTermMath: ReportFn;
declare const commitShortTermMath: ReportFn;
declare const commitSwingTermMath: ReportFn;

declare const commitBookDataReport: ReportFn;
declare const commitHistorySetup: (symbol: string, history: HistoryContract) => Promise<void>;

interface ILogger {
    log(topic: string, ...args: any[]): void;
    debug(topic: string, ...args: any[]): void;
    info(topic: string, ...args: any[]): void;
    warn(topic: string, ...args: any[]): void;
}

declare const setLogger: (logger: ILogger) => void;

interface ISwingTermRow {
    symbol: string;
    rsi14: number | null;
    stochasticRSI14: number | null;
    macd12_26_9: number | null;
    signal9: number | null;
    bollingerUpper20_2: number | null;
    bollingerMiddle20_2: number | null;
    bollingerLower20_2: number | null;
    bollingerWidth20_2: number | null;
    stochasticK14_3_3: number | null;
    stochasticD14_3_3: number | null;
    adx14: number | null;
    plusDI14: number | null;
    minusDI14: number | null;
    cci20: number | null;
    atr14: number | null;
    sma20: number | null;
    ema13: number | null;
    ema34: number | null;
    dema21: number | null;
    wma20: number | null;
    momentum8: number | null;
    support: number;
    resistance: number;
    currentPrice: number;
    volume: number;
    volatility: number | null;
    priceMomentum6: number | null;
    fibonacciNearestSupport: number | null;
    fibonacciNearestResistance: number | null;
    fibonacciCurrentLevel: string;
    bodySize: number;
    closePrice: number;
    date: Date;
    lookbackPeriod: string;
}
declare class SwingTermHistoryService {
    private loggerService;
    getData: (symbol: string, candles: ICandleData[]) => Promise<ISwingTermRow[]>;
    getReport: (symbol: string) => Promise<string>;
    generateHistoryTable: (symbol: string, rows: ISwingTermRow[]) => Promise<string>;
}

interface ILongTermRow {
    symbol: string;
    rsi14: number | null;
    stochasticRSI14: number | null;
    macd12_26_9: number | null;
    signal9: number | null;
    adx14: number | null;
    pdi14: number | null;
    ndi14: number | null;
    atr14: number | null;
    atr14_raw: number | null;
    atr20: number | null;
    cci20: number | null;
    bollinger20_2_upper: number | null;
    bollinger20_2_middle: number | null;
    bollinger20_2_lower: number | null;
    stochastic14_3_3_K: number | null;
    stochastic14_3_3_D: number | null;
    momentum10: number | null;
    dema21: number | null;
    wma20: number | null;
    sma50: number | null;
    ema20: number | null;
    ema34: number | null;
    currentPrice: number;
    support: number;
    resistance: number;
    volumeTrend: string;
    fibonacciNearestLevel: string;
    fibonacciNearestPrice: number;
    fibonacciDistance: number;
    bodySize: number;
    closePrice: number;
    date: Date;
    lookbackPeriod: string;
}
declare class LongTermHistoryService {
    private loggerService;
    getData: (symbol: string, candles: ICandleData[]) => Promise<ILongTermRow[]>;
    getReport: (symbol: string) => Promise<string>;
    generateHistoryTable: (symbol: string, rows: ILongTermRow[]) => Promise<string>;
}

interface IShortTermRow {
    symbol: string;
    rsi9: number | null;
    stochasticRSI9: number | null;
    macd8_21_5: number | null;
    signal5: number | null;
    bollingerUpper10_2: number | null;
    bollingerMiddle10_2: number | null;
    bollingerLower10_2: number | null;
    bollingerWidth10_2: number | null;
    stochasticK5_3_3: number | null;
    stochasticD5_3_3: number | null;
    adx14: number | null;
    plusDI14: number | null;
    minusDI14: number | null;
    atr9: number | null;
    cci14: number | null;
    sma50: number | null;
    ema8: number | null;
    ema21: number | null;
    dema21: number | null;
    wma20: number | null;
    momentum8: number | null;
    roc5: number | null;
    roc10: number | null;
    volumeTrend: string;
    support: number;
    resistance: number;
    currentPrice: number;
    fibonacciNearestLevel: string;
    fibonacciNearestPrice: number;
    fibonacciDistance: number;
    bodySize: number;
    closePrice: number;
    date: Date;
    lookbackPeriod: string;
}
declare class ShortTermHistoryService {
    private loggerService;
    getData: (symbol: string, candles: ICandleData[]) => Promise<IShortTermRow[]>;
    getReport: (symbol: string) => Promise<string>;
    generateHistoryTable: (symbol: string, rows: IShortTermRow[]) => Promise<string>;
}

interface IMicroTermRow {
    symbol: string;
    rsi9: number | null;
    rsi14: number | null;
    stochasticRSI9: number | null;
    stochasticRSI14: number | null;
    macd8_21_5: number | null;
    signal5: number | null;
    macdHistogram: number | null;
    bollingerUpper8_2: number | null;
    bollingerMiddle8_2: number | null;
    bollingerLower8_2: number | null;
    bollingerWidth8_2: number | null;
    bollingerPosition: number | null;
    stochasticK3_3_3: number | null;
    stochasticD3_3_3: number | null;
    stochasticK5_3_3: number | null;
    stochasticD5_3_3: number | null;
    adx9: number | null;
    plusDI9: number | null;
    minusDI9: number | null;
    atr5: number | null;
    atr9: number | null;
    cci9: number | null;
    momentum5: number | null;
    momentum10: number | null;
    roc1: number | null;
    roc3: number | null;
    roc5: number | null;
    ema3: number | null;
    ema8: number | null;
    ema13: number | null;
    ema21: number | null;
    sma8: number | null;
    dema8: number | null;
    wma5: number | null;
    volumeSma5: number | null;
    volumeRatio: number | null;
    volumeTrend: string;
    currentPrice: number;
    priceChange1m: number | null;
    priceChange3m: number | null;
    priceChange5m: number | null;
    volatility5: number | null;
    trueRange: number | null;
    support: number;
    resistance: number;
    squeezeMomentum: number | null;
    pressureIndex: number | null;
    closePrice: number;
    date: Date;
    lookbackPeriod: string;
}
declare class MicroTermHistoryService {
    private loggerService;
    getData: (symbol: string, candles: ICandleData[]) => Promise<IMicroTermRow[]>;
    getReport: (symbol: string) => Promise<string>;
    generateHistoryTable: (symbol: string, rows: IMicroTermRow[]) => Promise<string>;
}

declare class FifteenMinuteCandleHistoryService {
    private loggerService;
    getData: (symbol: string) => Promise<ICandleData[]>;
    generateReport: (symbol: string, candles: ICandleData[]) => Promise<string>;
    getReport: (symbol: string) => Promise<string>;
}

declare class HourCandleHistoryService {
    private loggerService;
    getData: (symbol: string) => Promise<ICandleData[]>;
    generateReport: (symbol: string, candles: ICandleData[]) => string;
    getReport: (symbol: string) => Promise<string>;
}

declare class OneMinuteCandleHistoryService {
    private loggerService;
    getData: (symbol: string) => Promise<ICandleData[]>;
    generateReport: (symbol: string, candles: ICandleData[]) => string;
    getReport: (symbol: string) => Promise<string>;
}

declare class ThirtyMinuteCandleHistoryService {
    private loggerService;
    getData: (symbol: string) => Promise<ICandleData[]>;
    generateReport: (symbol: string, candles: ICandleData[]) => string;
    getReport: (symbol: string) => Promise<string>;
}

interface IOrderBookEntry {
    price: number;
    quantity: number;
    percentage: number;
}
interface IBookDataAnalysis {
    symbol: string;
    timestamp: string;
    bids: IOrderBookEntry[];
    asks: IOrderBookEntry[];
    bestBid: number;
    bestAsk: number;
    midPrice: number;
    spread: number;
    depthImbalance: number;
}
declare class BookDataMathService {
    private loggerService;
    generateReport: (symbol: string, bookData: IBookDataAnalysis) => Promise<string>;
    getReport: (symbol: string) => Promise<string>;
    getData: (symbol: string) => Promise<IBookDataAnalysis>;
}

declare class LoggerService implements ILogger {
    private _commonLogger;
    log: (topic: string, ...args: any[]) => Promise<void>;
    debug: (topic: string, ...args: any[]) => Promise<void>;
    info: (topic: string, ...args: any[]) => Promise<void>;
    warn: (topic: string, ...args: any[]) => Promise<void>;
    setLogger: (logger: ILogger) => void;
}

declare const signal: {
    fifteenMinuteCandleHistoryService: FifteenMinuteCandleHistoryService;
    hourCandleHistoryService: HourCandleHistoryService;
    oneMinuteCandleHistoryService: OneMinuteCandleHistoryService;
    thirtyMinuteCandleHistoryService: ThirtyMinuteCandleHistoryService;
    swingTermMathService: SwingTermHistoryService;
    longTermMathService: LongTermHistoryService;
    shortTermMathService: ShortTermHistoryService;
    microTermMathService: MicroTermHistoryService;
    bookDataMathService: BookDataMathService;
    loggerService: LoggerService;
};

export { commitBookDataReport, commitFifteenMinuteHistory, commitHistorySetup, commitHourHistory, commitLongTermMath, commitMicroTermMath, commitOneMinuteHistory, commitShortTermMath, commitSwingTermMath, commitThirtyMinuteHistory, signal as lib, setLogger };
