import { ILogger } from "./Logger.interface";
import { MessageModel } from "src/model/Message.model";

export interface IOptimizerRange {
  note?: string;
  startDate: Date;
  endDate: Date;
}

export interface IOptimizerFetchArgs {
  symbol: string;
  startDate: Date;
  endDate: Date;
  limit: number;
  offset: number;
}

export interface IOptimizerSourceFn<Data extends object = any> {
  (args: IOptimizerFetchArgs): Data | Promise<Data>;
}

export interface IOptimizerSource<Data extends object = any> {
  note?: string;
  fetch: IOptimizerSourceFn<Data>;
  user?: (data: Data) => string | Promise<string>;
  assistant?: (data: Data) => string | Promise<string>;
}

type Source<Data extends object = any> =
  | IOptimizerSourceFn<Data>
  | IOptimizerSource<Data>;

export interface IOptimizerCallbacks {}

export interface IOptimizerTemplate {}

export interface IOptimizerValidationFn {
  (payload: any): void | Promise<void>;
}

export interface IOptimizerValidation {
  validate: IOptimizerValidationFn;
  note?: string;
}

export interface IOptimizerSchema<Data extends object = any> {
  note?: string;
  optimizerName: OptimizerName;
  range: IOptimizerRange[];
  source: Source<Data>[];
  getPrompt: (messages: MessageModel[]) => string | Promise<string>;
  template?: Partial<IOptimizerTemplate>;
  callbacks?: Partial<IOptimizerCallbacks>;
}

export interface IOptimizerParams extends IOptimizerSchema {
  logger: ILogger;
}

export interface IOptimizer {}

export type OptimizerName = string;
