import { inject } from "../../core/di";
import LoggerService from "../base/LoggerService";
import TYPES from "../../core/types";
import StrategyCoreService from "../core/StrategyCoreService";
import { Report } from "../../../classes/Report";
import { singleshot } from "functools-kit";
import ExecutionContextService, {
  TExecutionContextService,
} from "../context/ExecutionContextService";
import { FrameName } from "../../../interfaces/Frame.interface";
import { ExchangeName } from "../../../interfaces/Exchange.interface";
import { StrategyName } from "../../../interfaces/Strategy.interface";

const GET_EXECUTION_CONTEXT_FN = (self: StrategyReportService) => {
  if (ExecutionContextService.hasContext()) {
    const { when } = self.executionContextService.context;
    return { when: when.toISOString() };
  }
  return {
    when: "",
  };
};

export class StrategyReportService {
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
    this.loggerService.log("strategyReportService cancelScheduled", {
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
    await Report.writeData(
      "strategy",
      {
        action: "cancel-scheduled",
        cancelId,
        symbol,
        createdAt,
      },
      {
        signalId: scheduledRow.id,
        exchangeName: context.exchangeName,
        frameName: context.frameName,
        strategyName: context.strategyName,
        symbol,
        walkerName: "",
      },
    );
  };

  public closePending = async (
    symbol: string,
    isBacktest: boolean,
    context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName },
    closeId?: string,
  ) => {
    this.loggerService.log("strategyReportService closePending", {
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
    await Report.writeData(
      "strategy",
      {
        action: "close-pending",
        closeId,
        symbol,
        createdAt,
      },
      {
        signalId: pendingRow.id,
        exchangeName: context.exchangeName,
        frameName: context.frameName,
        strategyName: context.strategyName,
        symbol,
        walkerName: "",
      },
    );
  };

  public partialProfit = async (
    symbol: string,
    percentToClose: number,
    currentPrice: number,
    isBacktest: boolean,
    context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName },
  ) => {
    this.loggerService.log("strategyReportService partialProfit", {
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
    await Report.writeData(
      "strategy",
      {
        action: "partial-profit",
        percentToClose,
        currentPrice,
        symbol,
        createdAt,
      },
      {
        signalId: pendingRow.id,
        exchangeName: context.exchangeName,
        frameName: context.frameName,
        strategyName: context.strategyName,
        symbol,
        walkerName: "",
      },
    );
  };

  public partialLoss = async (
    symbol: string,
    percentToClose: number,
    currentPrice: number,
    isBacktest: boolean,
    context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName },
  ) => {
    this.loggerService.log("strategyReportService partialLoss", {
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
    await Report.writeData(
      "strategy",
      {
        action: "partial-loss",
        percentToClose,
        currentPrice,
        symbol,
        createdAt,
      },
      {
        signalId: pendingRow.id,
        exchangeName: context.exchangeName,
        frameName: context.frameName,
        strategyName: context.strategyName,
        symbol,
        walkerName: "",
      },
    );
  };

  public trailingStop = async (
    symbol: string,
    percentShift: number,
    currentPrice: number,
    isBacktest: boolean,
    context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName },
  ) => {
    this.loggerService.log("strategyReportService trailingStop", {
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
    await Report.writeData(
      "strategy",
      {
        action: "trailing-stop",
        percentShift,
        currentPrice,
        symbol,
        createdAt,
      },
      {
        signalId: pendingRow.id,
        exchangeName: context.exchangeName,
        frameName: context.frameName,
        strategyName: context.strategyName,
        symbol,
        walkerName: "",
      },
    );
  };

  public trailingTake = async (
    symbol: string,
    percentShift: number,
    currentPrice: number,
    isBacktest: boolean,
    context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName },
  ) => {
    this.loggerService.log("strategyReportService trailingTake", {
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
    await Report.writeData(
      "strategy",
      {
        action: "trailing-take",
        percentShift,
        currentPrice,
        symbol,
        createdAt,
      },
      {
        signalId: pendingRow.id,
        exchangeName: context.exchangeName,
        frameName: context.frameName,
        strategyName: context.strategyName,
        symbol,
        walkerName: "",
      },
    );
  };

  public breakeven = async (
    symbol: string,
    currentPrice: number,
    isBacktest: boolean,
    context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName }
  ) => {
    this.loggerService.log("strategyReportService breakeven", {
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
    await Report.writeData(
      "strategy",
      {
        action: "breakeven",
        currentPrice,
        symbol,
        createdAt,
      },
      {
        signalId: pendingRow.id,
        exchangeName: context.exchangeName,
        frameName: context.frameName,
        strategyName: context.strategyName,
        symbol,
        walkerName: "",
      },
    );
  };

  public subscribe = singleshot(() => {
    this.loggerService.log("strategyReportService subscribe");
    return () => {
      this.subscribe.clear();
    };
  });

  public unsubscribe = async () => {
    this.loggerService.log("strategyReportService unsubscribe");
    if (this.subscribe.hasValue()) {
      this.subscribe.clear();
    }
  };
}

export default StrategyReportService;
