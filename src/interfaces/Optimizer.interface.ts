import { CandleInterval } from "./Exchange.interface";
import { ILogger } from "./Logger.interface";
import { MessageModel } from "../model/Message.model";

type RowId = string | number;

export interface IOptimizerRange {
  note?: string;
  startDate: Date;
  endDate: Date;
}

export interface IOptimizerData {
  id: RowId;
}

export interface IOptimizerFilterArgs {
  symbol: string;
  startDate: Date;
  endDate: Date;
}

export interface IOptimizerFetchArgs extends IOptimizerFilterArgs {
  limit: number;
  offset: number;
}

export interface IOptimizerSourceFn<Data extends IOptimizerData = any> {
  (args: IOptimizerFetchArgs): Data[] | Promise<Data[]>;
}

export interface IOptimizerStrategy {
  symbol: string;
  messages: MessageModel[];
  strategy: string;
}

export interface IOptimizerSource<Data extends IOptimizerData = any> {
  note?: string;
  name: string;
  fetch: IOptimizerSourceFn<Data>;
  user?: (
    symbol: string,
    data: Data[],
    name: string
  ) => string | Promise<string>;
  assistant?: (
    symbol: string,
    data: Data[],
    name: string
  ) => string | Promise<string>;
}

type Source<Data extends IOptimizerData = any> =
  | IOptimizerSourceFn<Data>
  | IOptimizerSource<Data>;

export interface IOptimizerCallbacks {
  /**
   * Called after strategy data is generated for all train ranges.
   * Useful for logging or validating the generated strategies.
   *
   * @param symbol - Trading pair symbol
   * @param strategyData - Array of generated strategies with their messages
   */
  onData?: (symbol: string, strategyData: IOptimizerStrategy[]) => void | Promise<void>;

  /**
   * Called after strategy code is generated.
   * Useful for logging or validating the generated code.
   *
   * @param symbol - Trading pair symbol
   * @param code - Generated strategy code
   */
  onCode?: (symbol: string, code: string) => void | Promise<void>;

  /**
   * Called after strategy code is dumped to file.
   * Useful for logging or performing additional actions after file write.
   *
   * @param symbol - Trading pair symbol
   * @param filepath - Path where the file was saved
   */
  onDump?: (symbol: string, filepath: string) => void | Promise<void>;

  /**
   * Called after data is fetched from a source.
   * Useful for logging or validating the fetched data.
   *
   * @param symbol - Trading pair symbol
   * @param sourceName - Name of the data source
   * @param data - Array of fetched data
   * @param startDate - Start date of the data range
   * @param endDate - End date of the data range
   */
  onSourceData?: <Data extends IOptimizerData = any>(
    symbol: string,
    sourceName: string,
    data: Data[],
    startDate: Date,
    endDate: Date
  ) => void | Promise<void>;
}

export interface IOptimizerTemplate {
  getTopBanner(symbol: string): string | Promise<string>;
  getUserMessage<Data extends IOptimizerData = any>(
    symbol: string,
    data: Data[],
    name: string
  ): string | Promise<string>;
  getAssistantMessage<Data extends IOptimizerData = any>(
    symbol: string,
    data: Data[],
    name: string
  ): string | Promise<string>;
  getWalkerTemplate(
    walkerName: string,
    exchangeName: string,
    frameName: string,
    strategies: string[]
  ): string | Promise<string>;
  getExchangeTemplate(
    symbol: string,
    exchangeName: string
  ): string | Promise<string>;
  getFrameTemplate(
    symbol: string,
    frameName: string,
    interval: CandleInterval,
    startDate: Date,
    endDate: Date
  ): string | Promise<string>;
  getStrategyTemplate(
    strategyName: string,
    interval: string,
    prompt: string
  ): string | Promise<string>;
  getLauncherTemplate(
    symbol: string,
    walkerName: string
  ): string | Promise<string>;
  getTextTemplate(symbol: string): string | Promise<string>;
  getJsonTemplate(symbol: string): string | Promise<string>;
  getJsonDumpTemplate: (symbol: string) => string | Promise<string>;
}

export interface IOptimizerSchema {
  note?: string;
  optimizerName: OptimizerName;
  rangeTrain: IOptimizerRange[];
  rangeTest: IOptimizerRange;
  source: Source[];
  getPrompt: (
    symbol: string,
    messages: MessageModel[]
  ) => string | Promise<string>;
  template?: Partial<IOptimizerTemplate>;
  callbacks?: Partial<IOptimizerCallbacks>;
}

export interface IOptimizerParams extends IOptimizerSchema {
  logger: ILogger;
  template: IOptimizerTemplate;
}

export interface IOptimizer {
  getData(symbol: string): Promise<IOptimizerStrategy[]>;
  getCode(symbol: string): Promise<string>;
  dump(symbol: string, path?: string): Promise<void>;
}

export type OptimizerName = string;
