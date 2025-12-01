import { inject } from "../../core/di";
import LoggerService from "../base/LoggerService";
import TYPES from "../../core/types";
import { OptimizerName, IOptimizer, IOptimizerTemplate, IOptimizerStrategy } from "../../../interfaces/Optimizer.interface";
import { memoize } from "functools-kit";
import ClientOptimizer from "../../../client/ClientOptimizer";
import OptimizerSchemaService from "../schema/OptimizerSchemaService";
import OptimizerTemplateService from "../template/OptimizerTemplateService";

export type TOptimizer = {
  [key in keyof IOptimizer]: any;
};

export class OptimizerConnectionService implements TOptimizer {
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);
  private readonly optimizerSchemaService = inject<OptimizerSchemaService>(
    TYPES.optimizerSchemaService
  );
  private readonly optimizerTemplateService = inject<OptimizerTemplateService>(
    TYPES.optimizerTemplateService
  );

  public getOptimizer = memoize(
    ([optimizerName]) => `${optimizerName}`,
    (optimizerName: OptimizerName) => {
      const { getPrompt, rangeTest, rangeTrain, source, template: rawTemplate = {}, callbacks } =
        this.optimizerSchemaService.get(optimizerName);

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
      
      return new ClientOptimizer({
        optimizerName,
        logger: this.loggerService,
        getPrompt,
        rangeTest,
        rangeTrain,
        source,
        template,
        callbacks,
      });
    }
  );

  public getData = async (symbol: string, optimizerName: string): Promise<IOptimizerStrategy[]> => {
    this.loggerService.log("optimizerConnectionService getData", {
      symbol,
      optimizerName,
    });
    const optimizer = this.getOptimizer(optimizerName);
    return await optimizer.getData(symbol);
  }

  public getCode = async (symbol: string, optimizerName: string): Promise<string> => {
    this.loggerService.log("optimizerConnectionService getCode", {
      symbol,
      optimizerName,
    });
    const optimizer = this.getOptimizer(optimizerName);
    return await optimizer.getCode(symbol);
  }
  
  public dump = async (symbol: string, optimizerName: string, path?: string): Promise<void> => {
    this.loggerService.log("optimizerConnectionService getCode", {
      symbol,
      optimizerName,
    });
    const optimizer = this.getOptimizer(optimizerName);
    return await optimizer.dump(symbol, path);
  }
}

export default OptimizerConnectionService;