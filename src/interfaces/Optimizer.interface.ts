import { TMethodContextService } from "../lib/services/context/MethodContextService";
import { CandleInterval } from "./Exchange.interface";
import { ILogger } from "./Logger.interface";
import { MessageModel } from "src/model/Message.model";

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

export interface IOptimizerCallbacks {}

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

export interface IOptimizerValidationFn {
  (payload: any): void | Promise<void>;
}

export interface IOptimizerValidation {
  validate: IOptimizerValidationFn;
  note?: string;
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
  method: TMethodContextService;
  template: IOptimizerTemplate;
}

export interface IOptimizer {
  getData(symbol: string): Promise<IOptimizerStrategy[]>;
  getCode(symbol: string): Promise<string>;
  dump(symbol: string, path?: string): Promise<void>;
}

export type OptimizerName = string;
