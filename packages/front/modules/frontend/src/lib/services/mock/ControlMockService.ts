import LoggerService from "../base/LoggerService";
import { fetchApi, inject, randomString } from "react-declarative";
import TYPES from "../../core/TYPES";
import { CC_CLIENT_ID, CC_SERVICE_NAME, CC_USER_ID } from "../../../config/params";
import ControlStatusModel from "../../../model/ControlStatus.model";

export class ControlMockService {
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  public getStrategyStatus = async (
    symbol: string,
    context: { strategyName: string; exchangeName: string },
  ): Promise<ControlStatusModel> => {
    this.loggerService.log("controlMockService getStrategyStatus", { symbol, context });
    const { data, error } = await fetchApi("/api/v1/mock/control_status", {
      method: "POST",
      body: JSON.stringify({
        clientId: CC_CLIENT_ID,
        serviceName: CC_SERVICE_NAME,
        userId: CC_USER_ID,
        requestId: randomString(),
        symbol,
        context,
      }),
    });
    if (error) {
      throw new Error(error);
    }
    return data;
  };

  public commitOpenPending = async (
    symbol: string,
    context: { strategyName: string; exchangeName: string },
    dto: { position: "long" | "short"; cost: number; note: string },
  ): Promise<void> => {
    this.loggerService.log("controlMockService commitOpenPending", {
      symbol,
      context,
      dto,
    });
    const { error } = await fetchApi("/api/v1/mock/control_open_pending", {
      method: "POST",
      body: JSON.stringify({
        clientId: CC_CLIENT_ID,
        serviceName: CC_SERVICE_NAME,
        userId: CC_USER_ID,
        requestId: randomString(),
        symbol,
        context,
        dto,
      }),
    });
    if (error) {
      throw new Error(error);
    }
  };

  public commitAverageBuy = async (
    symbol: string,
    context: { strategyName: string; exchangeName: string },
    dto: { cost: number; note: string },
  ): Promise<void> => {
    this.loggerService.log("controlMockService commitAverageBuy", {
      symbol,
      context,
      dto,
    });
    const { error } = await fetchApi("/api/v1/mock/control_average_buy", {
      method: "POST",
      body: JSON.stringify({
        clientId: CC_CLIENT_ID,
        serviceName: CC_SERVICE_NAME,
        userId: CC_USER_ID,
        requestId: randomString(),
        symbol,
        context,
        dto,
      }),
    });
    if (error) {
      throw new Error(error);
    }
  };

  public commitClosePending = async (
    symbol: string,
    context: { strategyName: string; exchangeName: string },
    dto: { note: string },
  ): Promise<void> => {
    this.loggerService.log("controlMockService commitClosePending", {
      symbol,
      context,
      dto,
    });
    const { error } = await fetchApi("/api/v1/mock/control_close_pending", {
      method: "POST",
      body: JSON.stringify({
        clientId: CC_CLIENT_ID,
        serviceName: CC_SERVICE_NAME,
        userId: CC_USER_ID,
        requestId: randomString(),
        symbol,
        context,
        dto,
      }),
    });
    if (error) {
      throw new Error(error);
    }
  };

  public commitBreakeven = async (
    symbol: string,
    context: { strategyName: string; exchangeName: string },
  ): Promise<void> => {
    this.loggerService.log("controlMockService commitBreakeven", {
      symbol,
      context,
    });
    const { error } = await fetchApi("/api/v1/mock/control_breakeven", {
      method: "POST",
      body: JSON.stringify({
        clientId: CC_CLIENT_ID,
        serviceName: CC_SERVICE_NAME,
        userId: CC_USER_ID,
        requestId: randomString(),
        symbol,
        context,
      }),
    });
    if (error) {
      throw new Error(error);
    }
  };
}

export default ControlMockService;
