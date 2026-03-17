import LoggerService from "../base/LoggerService";
import TYPES from "../../core/TYPES";
import { fetchApi, inject, randomString } from "react-declarative";
import {
  CC_CLIENT_ID,
  CC_ENABLE_MOCK,
  CC_SERVICE_NAME,
  CC_USER_ID,
} from "../../../config/params";
import ExplorerMockService from "../mock/ExplorerMockService";
import { ExplorerNode } from "../../../model/Explorer.model";

export class ExplorerViewService {
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);
  private readonly explorerMockService = inject<ExplorerMockService>(TYPES.explorerMockService);

  public getTreeRaw = async (): Promise<ExplorerNode[]> => {
    this.loggerService.log("explorerViewService getTreeRaw");
    if (CC_ENABLE_MOCK) {
      return await this.explorerMockService.getTreeRaw();
    }
    const { data, error } = await fetchApi("/api/v1/explorer_view/tree", {
      method: "POST",
      body: JSON.stringify({
        clientId: CC_CLIENT_ID,
        serviceName: CC_SERVICE_NAME,
        userId: CC_USER_ID,
        requestId: randomString(),
      }),
    });
    if (error) {
      throw new Error(error);
    }
    return data;
  };

  public getTree = async (): Promise<ExplorerNode[]> => {
    this.loggerService.log("explorerViewService getTree");
    const raw = await this.getTreeRaw();
    return raw;
  };

  public getNode = async (path: string): Promise<string> => {
    this.loggerService.log("explorerViewService getNode", { path });
    if (CC_ENABLE_MOCK) {
      return await this.explorerMockService.getNode(path);
    }
    const { data, error } = await fetchApi("/api/v1/explorer_view/node", {
      method: "POST",
      body: JSON.stringify({
        clientId: CC_CLIENT_ID,
        serviceName: CC_SERVICE_NAME,
        userId: CC_USER_ID,
        requestId: randomString(),
        path,
      }),
    });
    if (error) {
      throw new Error(error);
    }
    return data;
  };
}

export default ExplorerViewService;
