import { inject } from "../../core/di";
import LoggerService from "../base/LoggerService";
import { TYPES } from "../../core/types";
import {
  OptimizerName,
  IOptimizer,
  IOptimizerTemplate,
  IOptimizerStrategy,
} from "../../../interface/Optimizer.interface";
import { memoize } from "functools-kit";
import ClientOptimizer from "../../../common/ClientOptimizer";
import OptimizerSchemaService from "../schema/OptimizerSchemaService";
import OptimizerTemplateService from "../template/OptimizerTemplateService";
import ProgressOptimizerContract from "../../../contract/ProgressOptimizer.contract";
import { progressOptimizerEmitter } from "../../../config/emitters";

/**
 * Callback function for emitting progress events to progressOptimizerEmitter.
 */
const COMMIT_PROGRESS_FN = async (progress: ProgressOptimizerContract) =>
  progressOptimizerEmitter.next(progress);

/**
 * Type helper for optimizer method signatures.
 * Maps IOptimizer interface methods to any return type.
 */
export type TOptimizer = {
  [key in keyof IOptimizer]: any;
};

/**
 * Service for creating and caching optimizer client instances.
 * Handles dependency injection and template merging.
 *
 * Features:
 * - Memoized optimizer instances (one per optimizerName)
 * - Template merging (custom + defaults)
 * - Logger injection
 * - Delegates to ClientOptimizer for actual operations
 */
export class OptimizerConnectionService implements TOptimizer {
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);
  private readonly optimizerSchemaService = inject<OptimizerSchemaService>(
    TYPES.optimizerSchemaService
  );
  private readonly optimizerTemplateService = inject<OptimizerTemplateService>(
    TYPES.optimizerTemplateService
  );

  /**
   * Creates or retrieves cached optimizer instance.
   * Memoized by optimizerName for performance.
   *
   * Merges custom templates from schema with defaults from OptimizerTemplateService.
   *
   * @param optimizerName - Unique optimizer identifier
   * @returns ClientOptimizer instance with resolved dependencies
   */
  public getOptimizer = memoize(
    ([optimizerName]) => `${optimizerName}`,
    (optimizerName: OptimizerName) => {
      const {
        getPrompt,
        rangeTest,
        rangeTrain,
        source,
        template: rawTemplate = {},
        callbacks,
      } = this.optimizerSchemaService.get(optimizerName);

      const {
        getAssistantMessage = this.optimizerTemplateService.getAssistantMessage,
        getExchangeTemplate = this.optimizerTemplateService.getExchangeTemplate,
        getFrameTemplate = this.optimizerTemplateService.getFrameTemplate,
        getJsonDumpTemplate = this.optimizerTemplateService.getJsonDumpTemplate,
        getJsonTemplate = this.optimizerTemplateService.getJsonTemplate,
        getLauncherTemplate = this.optimizerTemplateService.getLauncherTemplate,
        getStrategyTemplate = this.optimizerTemplateService.getStrategyTemplate,
        getTextTemplate = this.optimizerTemplateService.getTextTemplate,
        getWalkerTemplate = this.optimizerTemplateService.getWalkerTemplate,
        getTopBanner = this.optimizerTemplateService.getTopBanner,
        getUserMessage = this.optimizerTemplateService.getUserMessage,
      } = rawTemplate;

      const template: IOptimizerTemplate = {
        getAssistantMessage,
        getExchangeTemplate,
        getFrameTemplate,
        getJsonDumpTemplate,
        getJsonTemplate,
        getLauncherTemplate,
        getStrategyTemplate,
        getTextTemplate,
        getWalkerTemplate,
        getTopBanner,
        getUserMessage,
      };

      return new ClientOptimizer(
        {
          optimizerName,
          logger: this.loggerService,
          getPrompt,
          rangeTest,
          rangeTrain,
          source,
          template,
          callbacks,
        },
        COMMIT_PROGRESS_FN
      );
    }
  );

  /**
   * Fetches data from all sources and generates strategy metadata.
   *
   * @param symbol - Trading pair symbol
   * @param optimizerName - Optimizer identifier
   * @returns Array of generated strategies with conversation context
   */
  public getData = async (
    symbol: string,
    optimizerName: string
  ): Promise<IOptimizerStrategy[]> => {
    this.loggerService.log("optimizerConnectionService getData", {
      symbol,
      optimizerName,
    });
    const optimizer = this.getOptimizer(optimizerName);
    return await optimizer.getData(symbol);
  };

  /**
   * Generates complete executable strategy code.
   *
   * @param symbol - Trading pair symbol
   * @param optimizerName - Optimizer identifier
   * @returns Generated TypeScript/JavaScript code as string
   */
  public getCode = async (
    symbol: string,
    optimizerName: string
  ): Promise<string> => {
    this.loggerService.log("optimizerConnectionService getCode", {
      symbol,
      optimizerName,
    });
    const optimizer = this.getOptimizer(optimizerName);
    return await optimizer.getCode(symbol);
  };

  /**
   * Generates and saves strategy code to file.
   *
   * @param symbol - Trading pair symbol
   * @param optimizerName - Optimizer identifier
   * @param path - Output directory path (optional)
   */
  public dump = async (
    symbol: string,
    optimizerName: string,
    path?: string
  ): Promise<void> => {
    this.loggerService.log("optimizerConnectionService getCode", {
      symbol,
      optimizerName,
    });
    const optimizer = this.getOptimizer(optimizerName);
    return await optimizer.dump(symbol, path);
  };
}

export default OptimizerConnectionService;
