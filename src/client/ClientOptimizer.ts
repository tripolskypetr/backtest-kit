import {
  distinctDocuments,
  iterateDocuments,
  resolveDocuments,
  trycatch,
  errorData,
  getErrorMessage,
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
import ProgressOptimizerContract from "../contract/ProgressOptimizer.contract";
import backtest from "../lib";
import { errorEmitter } from "../config/emitters";

const ITERATION_LIMIT = 25;
const DEFAULT_SOURCE_NAME = "unknown";

const CREATE_PREFIX_FN = () => (Math.random() + 1).toString(36).substring(7);

/**
 * Wrapper to call onSourceData callback with error handling.
 * Catches and logs any errors thrown by the user-provided callback.
 */
const CALL_SOURCE_DATA_CALLBACKS_FN = trycatch(
  async (
    self: ClientOptimizer,
    symbol: string,
    name: string,
    data: IOptimizerData[],
    startDate: Date,
    endDate: Date
  ): Promise<void> => {
    if (self.params.callbacks?.onSourceData) {
      await self.params.callbacks.onSourceData(symbol, name, data, startDate, endDate);
    }
  },
  {
    fallback: (error) => {
      const message = "ClientOptimizer CALL_SOURCE_DATA_CALLBACKS_FN thrown";
      const payload = {
        error: errorData(error),
        message: getErrorMessage(error),
      };
      backtest.loggerService.warn(message, payload);
      console.warn(message, payload);
      errorEmitter.next(error);
    },
  }
);

/**
 * Wrapper to call onData callback with error handling.
 * Catches and logs any errors thrown by the user-provided callback.
 */
const CALL_DATA_CALLBACKS_FN = trycatch(
  async (
    self: ClientOptimizer,
    symbol: string,
    strategyList: IOptimizerStrategy[]
  ): Promise<void> => {
    if (self.params.callbacks?.onData) {
      await self.params.callbacks.onData(symbol, strategyList);
    }
  },
  {
    fallback: (error) => {
      const message = "ClientOptimizer CALL_DATA_CALLBACKS_FN thrown";
      const payload = {
        error: errorData(error),
        message: getErrorMessage(error),
      };
      backtest.loggerService.warn(message, payload);
      console.warn(message, payload);
      errorEmitter.next(error);
    },
  }
);

/**
 * Wrapper to call onCode callback with error handling.
 * Catches and logs any errors thrown by the user-provided callback.
 */
const CALL_CODE_CALLBACKS_FN = trycatch(
  async (
    self: ClientOptimizer,
    symbol: string,
    code: string
  ): Promise<void> => {
    if (self.params.callbacks?.onCode) {
      await self.params.callbacks.onCode(symbol, code);
    }
  },
  {
    fallback: (error) => {
      const message = "ClientOptimizer CALL_CODE_CALLBACKS_FN thrown";
      const payload = {
        error: errorData(error),
        message: getErrorMessage(error),
      };
      backtest.loggerService.warn(message, payload);
      console.warn(message, payload);
      errorEmitter.next(error);
    },
  }
);

/**
 * Wrapper to call onDump callback with error handling.
 * Catches and logs any errors thrown by the user-provided callback.
 */
const CALL_DUMP_CALLBACKS_FN = trycatch(
  async (
    self: ClientOptimizer,
    symbol: string,
    filepath: string
  ): Promise<void> => {
    if (self.params.callbacks?.onDump) {
      await self.params.callbacks.onDump(symbol, filepath);
    }
  },
  {
    fallback: (error) => {
      const message = "ClientOptimizer CALL_DUMP_CALLBACKS_FN thrown";
      const payload = {
        error: errorData(error),
        message: getErrorMessage(error),
      };
      backtest.loggerService.warn(message, payload);
      console.warn(message, payload);
      errorEmitter.next(error);
    },
  }
);

/**
 * Default user message formatter.
 * Delegates to template's getUserMessage method.
 *
 * @param symbol - Trading pair symbol
 * @param data - Fetched data array
 * @param name - Source name
 * @param self - ClientOptimizer instance
 * @returns Formatted user message content
 */
const DEFAULT_USER_FN = async <Data extends IOptimizerData = any>(
  symbol: string,
  data: Data[],
  name: string,
  self: ClientOptimizer
) => {
  return await self.params.template.getUserMessage(symbol, data, name);
};

/**
 * Default assistant message formatter.
 * Delegates to template's getAssistantMessage method.
 *
 * @param symbol - Trading pair symbol
 * @param data - Fetched data array
 * @param name - Source name
 * @param self - ClientOptimizer instance
 * @returns Formatted assistant message content
 */
const DEFAULT_ASSISTANT_FN = async <Data extends IOptimizerData = any>(
  symbol: string,
  data: Data[],
  name: string,
  self: ClientOptimizer
) => {
  return await self.params.template.getAssistantMessage(symbol, data, name);
};

/**
 * Resolves paginated data from source with deduplication.
 * Uses iterateDocuments to handle pagination automatically.
 *
 * @param fetch - Source fetch function
 * @param filterData - Filter arguments (symbol, dates)
 * @returns Deduplicated array of all fetched data
 */
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

/**
 * Collects data from all sources and generates strategy metadata.
 * Iterates through training ranges, fetches data from each source,
 * builds LLM conversation history, and generates strategy prompts.
 *
 * @param symbol - Trading pair symbol
 * @param self - ClientOptimizer instance
 * @returns Array of generated strategies with conversation context
 */
const GET_STRATEGY_DATA_FN = async (symbol: string, self: ClientOptimizer) => {
  const strategyList: IOptimizerStrategy[] = [];
  const totalSources = self.params.rangeTrain.length * self.params.source.length;
  let processedSources = 0;

  for (const { startDate, endDate } of self.params.rangeTrain) {
    const messageList: MessageModel[] = [];
    for (const source of self.params.source) {
      // Emit progress event at the start of processing each source
      await self.onProgress({
        optimizerName: self.params.optimizerName,
        symbol,
        totalSources,
        processedSources,
        progress: totalSources > 0 ? processedSources / totalSources : 0,
      });
      if (typeof source === "function") {
        const data = await RESOLVE_PAGINATION_FN(source, {
          symbol,
          startDate,
          endDate,
        });

        await CALL_SOURCE_DATA_CALLBACKS_FN(
          self,
          symbol,
          DEFAULT_SOURCE_NAME,
          data,
          startDate,
          endDate
        );

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

        processedSources++;
      } else {
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

        await CALL_SOURCE_DATA_CALLBACKS_FN(
          self,
          symbol,
          name,
          data,
          startDate,
          endDate
        );

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

        processedSources++;
      }
      const name =
        "name" in source
          ? source.name || DEFAULT_SOURCE_NAME
          : DEFAULT_SOURCE_NAME;
      strategyList.push({
        symbol,
        name,
        messages: messageList,
        strategy: await self.params.getPrompt(symbol, messageList),
      });
    }
  }

  // Emit final progress event (100%)
  await self.onProgress({
    optimizerName: self.params.optimizerName,
    symbol,
    totalSources,
    processedSources: totalSources,
    progress: 1.0,
  });

  await CALL_DATA_CALLBACKS_FN(self, symbol, strategyList);

  return strategyList;
};

/**
 * Generates complete executable strategy code.
 * Assembles all components: imports, helpers, exchange, frames, strategies, walker, launcher.
 *
 * @param symbol - Trading pair symbol
 * @param self - ClientOptimizer instance
 * @returns Generated TypeScript/JavaScript code as string
 */
const GET_STRATEGY_CODE_FN = async (symbol: string, self: ClientOptimizer) => {
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
        exchangeName,
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
        `${exchangeName}`,
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

  const code = sections.join("\n");

  await CALL_CODE_CALLBACKS_FN(self, symbol, code);

  return code;
};

/**
 * Saves generated strategy code to file.
 * Creates directory if needed, writes .mjs file with generated code.
 *
 * @param symbol - Trading pair symbol
 * @param path - Output directory path
 * @param self - ClientOptimizer instance
 */
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

    await CALL_DUMP_CALLBACKS_FN(self, symbol, filepath);
  } catch (error) {
    self.params.logger.warn(`Failed to save optimizer report:`, error);
    throw error;
  }
};

/**
 * Client implementation for optimizer operations.
 *
 * Features:
 * - Data collection from multiple sources with pagination
 * - LLM conversation history building
 * - Strategy code generation with templates
 * - File export with callbacks
 *
 * Used by OptimizerConnectionService to create optimizer instances.
 */
export class ClientOptimizer implements IOptimizer {
  constructor(
    readonly params: IOptimizerParams,
    readonly onProgress: (progress: ProgressOptimizerContract) => void,
  ) {}

  /**
   * Fetches data from all sources and generates strategy metadata.
   * Processes each training range and builds LLM conversation history.
   *
   * @param symbol - Trading pair symbol
   * @returns Array of generated strategies with conversation context
   */
  public getData = async (symbol: string) => {
    this.params.logger.debug("ClientOptimizer getData", {
      symbol,
    });
    return await GET_STRATEGY_DATA_FN(symbol, this);
  };

  /**
   * Generates complete executable strategy code.
   * Includes imports, helpers, strategies, walker, and launcher.
   *
   * @param symbol - Trading pair symbol
   * @returns Generated TypeScript/JavaScript code as string
   */
  public getCode = async (symbol: string): Promise<string> => {
    this.params.logger.debug("ClientOptimizer getCode", {
      symbol,
    });
    return await GET_STRATEGY_CODE_FN(symbol, this);
  };

  /**
   * Generates and saves strategy code to file.
   * Creates directory if needed, writes .mjs file.
   *
   * @param symbol - Trading pair symbol
   * @param path - Output directory path (default: "./")
   */
  public dump = async (symbol: string, path = "./"): Promise<void> => {
    this.params.logger.debug("ClientOptimizer dump", {
      symbol,
      path,
    });
    return await GET_STRATEGY_DUMP_FN(symbol, path, this);
  };
}

export default ClientOptimizer;
