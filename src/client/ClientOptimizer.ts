import {
  distinctDocuments,
  iterateDocuments,
  resolveDocuments,
  str,
} from "functools-kit";
import {
  IOptimizer,
  IOptimizerData,
  IOptimizerFilterArgs,
  IOptimizerParams,
  IOptimizerSourceFn,
  IOptimizerStrategy,
} from "../interfaces/Optimizer.interface";
import { MessageModel } from "../model/Message.model";

const ITERATION_LIMIT = 25;
const DEFAULT_SOURCE_NAME = "unknown";

const DEFAULT_USER_FN = async <Data extends IOptimizerData = any>(
  symbol: string,
  data: Data[],
  name: string,
  self: ClientOptimizer
) => {
  if (self.params.template?.getUserMessage) {
    return await self.params.template.getUserMessage(symbol, data, name);
  }
  return str.newline("Прочитай данные и скажи ОК", "", JSON.stringify(data));
};

const DEFAULT_ASSISTANT_FN = async <Data extends IOptimizerData = any>(
  symbol: string,
  data: Data[],
  name: string,
  self: ClientOptimizer
) => {
  if (self.params.template?.getAssistantMessage) {
    return await self.params.template.getAssistantMessage(symbol, data, name);
  }
  return "ОК";
};

const RESOLVE_PAGINATION_FN = async <Data extends IOptimizerData = any>(
  fetch: IOptimizerSourceFn,
  filterData: IOptimizerFilterArgs
) => {
  const iterator = iterateDocuments<Data>({
    limit: ITERATION_LIMIT,
    async createRequest({ limit, offset }) {
      return await fetch({
        symbol: filterData.symbol,
        startDate: filterData.startDate,
        endDate: filterData.endDate,
        limit,
        offset,
      });
    },
  });
  const distinct = distinctDocuments(iterator, (data) => data.id);
  return await resolveDocuments(distinct);
};

const GET_STRATEGY_DATA_FN = async (symbol: string, self: ClientOptimizer) => {
  const strategyList: IOptimizerStrategy[] = [];
  for (const { startDate, endDate } of self.params.range) {
    const messageList: MessageModel[] = [];
    for (const source of self.params.source) {
      if (typeof source === "function") {
        const data = await RESOLVE_PAGINATION_FN(source, {
          symbol,
          startDate,
          endDate,
        });
        const [userContent, assistantContent] = await Promise.all([
          DEFAULT_USER_FN(symbol, data, DEFAULT_SOURCE_NAME, this),
          DEFAULT_ASSISTANT_FN(symbol, data, DEFAULT_SOURCE_NAME, this),
        ]);
        messageList.push(
          {
            role: "user",
            content: userContent,
          },
          {
            role: "assistant",
            content: assistantContent,
          }
        );
        return;
      }
      const {
        fetch,
        name = DEFAULT_SOURCE_NAME,
        assistant = DEFAULT_ASSISTANT_FN,
        user = DEFAULT_USER_FN,
      } = source;
      const data = await RESOLVE_PAGINATION_FN(fetch, {
        symbol,
        startDate,
        endDate,
      });
      const [userContent, assistantContent] = await Promise.all([
        user(symbol, data, name, this),
        assistant(symbol, data, name, this),
      ]);
      messageList.push(
        {
          role: "user",
          content: userContent,
        },
        {
          role: "assistant",
          content: assistantContent,
        }
      );
    }
    strategyList.push({
      symbol,
      messages: messageList,
      strategy: await self.params.getPrompt(symbol, messageList),
    });
  }
  return strategyList;
};

export class ClientOptimizer implements IOptimizer {
  constructor(readonly params: IOptimizerParams) {}

  public getData = async (symbol: string) => {
    this.params.logger.debug("ClientOptimizer getData", {
      symbol,
    });
    return await GET_STRATEGY_DATA_FN(symbol, this);
  };

  public getReport = async (symbol: string): Promise<string> => {
    this.params.logger.debug("ClientOptimizer getReport", {
      symbol,
    });
    const strategyData = await this.getData(symbol);

    return "";
  }

}

export default ClientOptimizer;
