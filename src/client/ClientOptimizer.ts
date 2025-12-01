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
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";

const ITERATION_LIMIT = 25;
const DEFAULT_SOURCE_NAME = "unknown";

const CREATE_PREFIX_FN = () => (Math.random() + 1).toString(36).substring(7);

const DEFAULT_USER_FN = async <Data extends IOptimizerData = any>(
  symbol: string,
  data: Data[],
  name: string,
  self: ClientOptimizer
) => {
  return await self.params.template.getUserMessage(symbol, data, name);
};

const DEFAULT_ASSISTANT_FN = async <Data extends IOptimizerData = any>(
  symbol: string,
  data: Data[],
  name: string,
  self: ClientOptimizer
) => {
  return await self.params.template.getAssistantMessage(symbol, data, name);
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
  for (const { startDate, endDate } of self.params.rangeTrain) {
    const messageList: MessageModel[] = [];
    for (const source of self.params.source) {
      if (typeof source === "function") {
        const data = await RESOLVE_PAGINATION_FN(source, {
          symbol,
          startDate,
          endDate,
        });
        const [userContent, assistantContent] = await Promise.all([
          DEFAULT_USER_FN(symbol, data, DEFAULT_SOURCE_NAME, self),
          DEFAULT_ASSISTANT_FN(symbol, data, DEFAULT_SOURCE_NAME, self),
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
        user(symbol, data, name, self),
        assistant(symbol, data, name, self),
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

const GET_STRATEGY_CODE_FN = async (
  symbol: string,
  self: ClientOptimizer
) => {
  const strategyData = await self.getData(symbol);

  const prefix = CREATE_PREFIX_FN();
  const sections: string[] = [];
  const exchangeName = `${prefix}_exchange`;

  // 1. Top banner with imports
  {
    sections.push(await self.params.template.getTopBanner(symbol));
    sections.push("");
  }

  // 2. JSON dump helper function
  {
    sections.push(await self.params.template.getJsonDumpTemplate(symbol));
    sections.push("");
  }

  // 3. Helper functions (text and json)
  {
    sections.push(await self.params.template.getTextTemplate(symbol));
    sections.push("");
  }

  {
    sections.push(await self.params.template.getJsonTemplate(symbol));
    sections.push("");
  }

  // 4. Exchange template (assuming first strategy has exchange info)
  {
    sections.push(
      await self.params.template.getExchangeTemplate(
        symbol,
        `${prefix}_${exchangeName}`
      )
    );
    sections.push("");
  }

  // 5. Train frame templates
  {
    for (let i = 0; i < self.params.rangeTrain.length; i++) {
      const range = self.params.rangeTrain[i];
      const frameName = `${prefix}_train_frame-${i + 1}`;
      sections.push(
        await self.params.template.getFrameTemplate(
          symbol,
          frameName,
          "1m", // default interval
          range.startDate,
          range.endDate
        )
      );
      sections.push("");
    }
  }

  // 6. Test frame template
  {
    const testFrameName = `${prefix}_test_frame`;
    sections.push(
      await self.params.template.getFrameTemplate(
        symbol,
        testFrameName,
        "1m", // default interval
        self.params.rangeTest.startDate,
        self.params.rangeTest.endDate
      )
    );
    sections.push("");
  }

  // 7. Strategy templates for each generated strategy
  {
    for (let i = 0; i < strategyData.length; i++) {
      const strategy = strategyData[i];
      const strategyName = `${prefix}_strategy-${i + 1}`;
      const interval = "5m"; // default interval
      sections.push(
        await self.params.template.getStrategyTemplate(
          strategyName,
          interval,
          strategy.strategy
        )
      );
      sections.push("");
    }
  }

  // 8. Walker template (uses test frame for validation)
  {
    const walkerName = `${prefix}_walker`;
    const testFrameName = `${prefix}_test_frame`;
    const strategies = strategyData.map(
      (_, i) => `${prefix}_strategy-${i + 1}`
    );
    sections.push(
      await self.params.template.getWalkerTemplate(
        walkerName,
        `${prefix}_${exchangeName}`,
        testFrameName,
        strategies
      )
    );
    sections.push("");
  }

  // 9. Launcher template
  {
    const walkerName = `${prefix}_walker`;
    sections.push(
      await self.params.template.getLauncherTemplate(symbol, walkerName)
    );
    sections.push("");
  }

  return str.newline(sections);
};

const GET_STRATEGY_DUMP_FN = async (
  symbol: string,
  path: string,
  self: ClientOptimizer
) => {
  const report = await self.getCode(symbol);

  try {
    const dir = join(process.cwd(), path);
    await mkdir(dir, { recursive: true });

    const filename = `${self.params.optimizerName}_${symbol}.mjs`;
    const filepath = join(dir, filename);

    await writeFile(filepath, report, "utf-8");
    self.params.logger.info(`Optimizer report saved: ${filepath}`);
  } catch (error) {
    self.params.logger.warn(`Failed to save optimizer report:`, error);
    throw error;
  }
};

export class ClientOptimizer implements IOptimizer {
  constructor(readonly params: IOptimizerParams) {}

  public getData = async (symbol: string) => {
    this.params.logger.debug("ClientOptimizer getData", {
      symbol,
    });
    return await GET_STRATEGY_DATA_FN(symbol, this);
  };

  public getCode = async (symbol: string): Promise<string> => {
    this.params.logger.debug("ClientOptimizer getCode", {
      symbol,
    });
    return await GET_STRATEGY_CODE_FN(symbol, this);
  };

  public dump = async (symbol: string, path = "./"): Promise<void> => {
    this.params.logger.debug("ClientOptimizer dump", {
      symbol,
      path,
    });
    return await GET_STRATEGY_DUMP_FN(symbol, path, this);
  };
}

export default ClientOptimizer;
