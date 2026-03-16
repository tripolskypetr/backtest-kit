import fs from "fs/promises";
import { singleshot } from "functools-kit";

import { inject } from "../../../lib/core/di";
import LoggerService from "../base/LoggerService";
import { TYPES } from "../../../lib/core/types";
import { ExplorerNode } from "../../../model/Explorer.model";

const findNode = (nodes: ExplorerNode[], nodePath: string): boolean => {
  for (const node of nodes) {
    if (node.path === nodePath) {
      return true;
    }
    if (node.type === "directory" && findNode(node.nodes, nodePath)) {
      return true;
    }
  }
  return false;
};

const MOCK_PATH = "./mock/explorer.json";

const READ_EXPLORER_TREE_FN = singleshot(
  async (): Promise<ExplorerNode[]> => {
    const data = await fs.readFile(MOCK_PATH, "utf-8");
    return JSON.parse(data);
  },
);

export class ExplorerMockService {
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  public getNode = async (nodePath: string): Promise<string> => {
    this.loggerService.log("explorerMockService getNode", {
      nodePath,
    });
    return "";
  };

  public getTree = async (): Promise<ExplorerNode[]> => {
    this.loggerService.log("explorerMockService getTree");
    return await READ_EXPLORER_TREE_FN();
  };
}

export default ExplorerMockService;
