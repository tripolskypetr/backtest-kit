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
  getUserMessage<Data extends IOptimizerData = any>(
    symbol: string,
    data: Data[],
    name: string
  ): Promise<string>;
  getAssistantMessage<Data extends IOptimizerData = any>(
    symbol: string,
    data: Data[],
    name: string
  ): Promise<string>;
  getTextTemplate(): Promise<string>;
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
  range: IOptimizerRange[];
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
}

export interface IOptimizer {
  getData(symbol: string): Promise<IOptimizerStrategy[]>;
  getReport(symbol: string): Promise<string>;
}

export type OptimizerName = string;
