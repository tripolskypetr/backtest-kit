import { inject } from "../../../lib/core/di";
import LoggerService from "../base/LoggerService";
import TYPES from "../../../lib/core/types";
import { getConfig } from "../../../config/params";
import { fetchApi, randomString } from "functools-kit";
import { IMCPMessage } from "tradeforge";

const CLIENT_ID = randomString();
const SERVICE_NAME = "backtest-kit-mcp";
const USER_ID = "unknown";

export class MCPCommandService {
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  public getStatus = async (): Promise<IMCPMessage[]> => {
    this.loggerService.log("mcpCommandService getStatus");
    const GLOBAL_CONFIG = getConfig();
    const requestId = randomString();
    const url = new URL(
      "/api/v1/mcp/get_status",
      `http://${GLOBAL_CONFIG.CC_MCP_HOST}:${GLOBAL_CONFIG.CC_MCP_PORT}`,
    );
    const { data, error } = await fetchApi(url.toString(), {
      method: "POST",
      body: JSON.stringify({
        clientId: CLIENT_ID,
        serviceName: SERVICE_NAME,
        userId: USER_ID,
        requestId,
      }),
    });
    if (error) {
      throw new Error(error);
    }
    return data;
  };

  public commitPositionOpen = async (dto: {
    symbol: string;
    position: "long" | "short";
    note: string;
  }) => {
    this.loggerService.log("mcpCommandService commitPositionOpen", {
      dto,
    });
    const GLOBAL_CONFIG = getConfig();
    const requestId = randomString();
    const url = new URL(
      "/api/v1/mcp/commit_position_open",
      `http://${GLOBAL_CONFIG.CC_MCP_HOST}:${GLOBAL_CONFIG.CC_MCP_PORT}`,
    );
    const { data, error } = await fetchApi(url.toString(), {
      method: "POST",
      body: JSON.stringify({
        clientId: CLIENT_ID,
        serviceName: SERVICE_NAME,
        userId: USER_ID,
        data: dto,
        requestId,
      }),
    });
    if (error) {
      throw new Error(error);
    }
    return data;
  };

  public commitPositionClose = async (dto: {
    symbol: string;
    note: string;
  }) => {
    this.loggerService.log("mcpCommandService commitPositionClose", {
      dto,
    });
    const GLOBAL_CONFIG = getConfig();
    const requestId = randomString();
    const url = new URL(
      "/api/v1/mcp/commit_position_close",
      `http://${GLOBAL_CONFIG.CC_MCP_HOST}:${GLOBAL_CONFIG.CC_MCP_PORT}`,
    );
    const { data, error } = await fetchApi(url.toString(), {
      method: "POST",
      body: JSON.stringify({
        clientId: CLIENT_ID,
        serviceName: SERVICE_NAME,
        userId: USER_ID,
        data: dto,
        requestId,
      }),
    });
    if (error) {
      throw new Error(error);
    }
    return data;
  };

  public commitAverageBuy = async (dto: { symbol: string }) => {
    this.loggerService.log("mcpCommandService commitAverageBuy", {
      dto,
    });
    const GLOBAL_CONFIG = getConfig();
    const requestId = randomString();
    const url = new URL(
      "/api/v1/mcp/commit_average_buy",
      `http://${GLOBAL_CONFIG.CC_MCP_HOST}:${GLOBAL_CONFIG.CC_MCP_PORT}`,
    );
    const { data, error } = await fetchApi(url.toString(), {
      method: "POST",
      body: JSON.stringify({
        clientId: CLIENT_ID,
        serviceName: SERVICE_NAME,
        userId: USER_ID,
        data: dto,
        requestId,
      }),
    });
    if (error) {
      throw new Error(error);
    }
    return data;
  };

  public commitSignalNotify = async (dto: {
    symbol: string;
    note: string;
  }) => {
    this.loggerService.log("mcpCommandService commitSignalNotify", {
      dto,
    });
    const GLOBAL_CONFIG = getConfig();
    const requestId = randomString();
    const url = new URL(
      "/api/v1/mcp/commit_signal_notify",
      `http://${GLOBAL_CONFIG.CC_MCP_HOST}:${GLOBAL_CONFIG.CC_MCP_PORT}`,
    );
    const { data, error } = await fetchApi(url.toString(), {
      method: "POST",
      body: JSON.stringify({
        clientId: CLIENT_ID,
        serviceName: SERVICE_NAME,
        userId: USER_ID,
        data: dto,
        requestId,
      }),
    });
    if (error) {
      throw new Error(error);
    }
    return data;
  };
}

export default MCPCommandService;
