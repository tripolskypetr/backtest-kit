import LoggerService from "../base/LoggerService";
import { fetchApi, inject, randomString } from "react-declarative";
import TYPES from "../../core/TYPES";
import { CC_CLIENT_ID, CC_SERVICE_NAME, CC_USER_ID } from "../../../config/params";
import { ExplorerNode } from "../../../model/Explorer.model";

export class ExplorerMockService {
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  public getTree = async (): Promise<ExplorerNode[]> => {
    this.loggerService.log("explorerMockService getTree");
    const { data, error } = await fetchApi("/api/v1/explorer_mock/tree", {
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

  public getNode = async (path: string): Promise<string> => {
    this.loggerService.log("explorerMockService getNode", { path });
    const { data, error } = await fetchApi("/api/v1/explorer_mock/node", {
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

export default ExplorerMockService;
