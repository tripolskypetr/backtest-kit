import { inject } from "../../core/di";
import LoggerService from "../base/LoggerService";
import TYPES from "../../core/types";
import { singleshot } from "functools-kit";
import ExecutionContextService, {
  TExecutionContextService,
} from "../context/ExecutionContextService";
import StrategyCoreService from "../core/StrategyCoreService";
import { StrategyName } from "../../../interfaces/Strategy.interface";
import { ExchangeName } from "../../../interfaces/Exchange.interface";
import { FrameName } from "../../../interfaces/Frame.interface";

const GET_EXECUTION_CONTEXT_FN = (self: StrategyMarkdownService) => {
  if (ExecutionContextService.hasContext()) {
    const { when } = self.executionContextService.context;
    return { when: when.toISOString() };
  }
  return {
    when: "",
  };
};

export class StrategyMarkdownService {
  readonly loggerService = inject<LoggerService>(TYPES.loggerService);
  readonly executionContextService = inject<TExecutionContextService>(
    TYPES.executionContextService,
  );
  readonly strategyCoreService = inject<StrategyCoreService>(
    TYPES.strategyCoreService,
  );

  public cancelScheduled = async (
    symbol: string,
    isBacktest: boolean,
    context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName },
    cancelId?: string,
  ) => {
    this.loggerService.log("strategyMarkdownService cancelScheduled", {
      symbol,
      isBacktest,
      cancelId,
    });
    if (!this.subscribe.hasValue()) {
      return;
    }
    const { when: createdAt } = GET_EXECUTION_CONTEXT_FN(this);
    const scheduledRow = await this.strategyCoreService.getScheduledSignal(
      isBacktest,
      symbol,
      {
        exchangeName: context.exchangeName,
        strategyName: context.strategyName,
        frameName: context.frameName,
      },
    );
    if (!scheduledRow) {
      return;
    }
  };

  public closePending = async (
    symbol: string,
    isBacktest: boolean,
    context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName },
    closeId?: string,
  ) => {
    this.loggerService.log("strategyMarkdownService closePending", {
      symbol,
      isBacktest,
      closeId,
    });
    if (!this.subscribe.hasValue()) {
      return;
    }
    const { when: createdAt } = GET_EXECUTION_CONTEXT_FN(this);
    const pendingRow = await this.strategyCoreService.getPendingSignal(
      isBacktest,
      symbol,
      {
        exchangeName: context.exchangeName,
        strategyName: context.strategyName,
        frameName: context.frameName,
      },
    );
    if (!pendingRow) {
      return;
    }
  };

  public partialProfit = async (
    symbol: string,
    percentToClose: number,
    currentPrice: number,
    isBacktest: boolean,
    context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName },
  ) => {
    this.loggerService.log("strategyMarkdownService partialProfit", {
      symbol,
      percentToClose,
      currentPrice,
      isBacktest,
    });
    if (!this.subscribe.hasValue()) {
      return;
    }
    const { when: createdAt } = GET_EXECUTION_CONTEXT_FN(this);
    const pendingRow = await this.strategyCoreService.getPendingSignal(
      isBacktest,
      symbol,
      {
        exchangeName: context.exchangeName,
        strategyName: context.strategyName,
        frameName: context.frameName,
      },
    );
    if (!pendingRow) {
      return;
    }
  };

  public partialLoss = async (
    symbol: string,
    percentToClose: number,
    currentPrice: number,
    isBacktest: boolean,
    context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName },
  ) => {
    this.loggerService.log("strategyMarkdownService partialLoss", {
      symbol,
      percentToClose,
      currentPrice,
      isBacktest,
    });
    if (!this.subscribe.hasValue()) {
      return;
    }
    const { when: createdAt } = GET_EXECUTION_CONTEXT_FN(this);
    const pendingRow = await this.strategyCoreService.getPendingSignal(
      isBacktest,
      symbol,
      {
        exchangeName: context.exchangeName,
        strategyName: context.strategyName,
        frameName: context.frameName,
      },
    );
    if (!pendingRow) {
      return;
    }
  };

  public trailingStop = async (
    symbol: string,
    percentShift: number,
    currentPrice: number,
    isBacktest: boolean,
    context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName },
  ) => {
    this.loggerService.log("strategyMarkdownService trailingStop", {
      symbol,
      percentShift,
      currentPrice,
      isBacktest,
    });
    if (!this.subscribe.hasValue()) {
      return;
    }
    const { when: createdAt } = GET_EXECUTION_CONTEXT_FN(this);
    const pendingRow = await this.strategyCoreService.getPendingSignal(
      isBacktest,
      symbol,
      {
        exchangeName: context.exchangeName,
        strategyName: context.strategyName,
        frameName: context.frameName,
      },
    );
    if (!pendingRow) {
      return;
    }
  };

  public trailingTake = async (
    symbol: string,
    percentShift: number,
    currentPrice: number,
    isBacktest: boolean,
    context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName },
  ) => {
    this.loggerService.log("strategyMarkdownService trailingTake", {
      symbol,
      percentShift,
      currentPrice,
      isBacktest,
    });
    if (!this.subscribe.hasValue()) {
      return;
    }
    const { when: createdAt } = GET_EXECUTION_CONTEXT_FN(this);
    const pendingRow = await this.strategyCoreService.getPendingSignal(
      isBacktest,
      symbol,
      {
        exchangeName: context.exchangeName,
        strategyName: context.strategyName,
        frameName: context.frameName,
      },
    );
    if (!pendingRow) {
      return;
    }
  };

  public breakeven = async (
    symbol: string,
    currentPrice: number,
    isBacktest: boolean,
    context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName },
  ) => {
    this.loggerService.log("strategyMarkdownService breakeven", {
      symbol,
      currentPrice,
      isBacktest,
    });
    if (!this.subscribe.hasValue()) {
      return;
    }
    const { when: createdAt } = GET_EXECUTION_CONTEXT_FN(this);
    const pendingRow = await this.strategyCoreService.getPendingSignal(
      isBacktest,
      symbol,
      {
        exchangeName: context.exchangeName,
        strategyName: context.strategyName,
        frameName: context.frameName,
      },
    );
    if (!pendingRow) {
      return;
    }
  };

  public subscribe = singleshot(() => {
    this.loggerService.log("strategyMarkdownService subscribe");
    return () => {
      this.subscribe.clear();
    };
  });

  public unsubscribe = async () => {
    this.loggerService.log("strategyMarkdownService unsubscribe");
    if (this.subscribe.hasValue()) {
      this.subscribe.clear();
    }
  };
}

export default StrategyMarkdownService;
