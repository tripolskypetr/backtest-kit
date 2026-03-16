import fs from "fs/promises";
import { singleshot } from "functools-kit";

import { inject } from "../../../lib/core/di";
import LoggerService from "../base/LoggerService";
import { TYPES } from "../../../lib/core/types";
import { ExplorerNode } from "../../../model/Explorer.model";

const MOCK_PATH = "./mock/explorer.json";

const READ_EXPLORER_TREE_FN = singleshot(
  async (): Promise<ExplorerNode[]> => {
    const data = await fs.readFile(MOCK_PATH, "utf-8");
    return JSON.parse(data);
  },
);

export class ExplorerMockService {
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  public getTree = async (): Promise<ExplorerNode[]> => {
    this.loggerService.log("explorerMockService getTree");
    return await READ_EXPLORER_TREE_FN();
  };
}

export default ExplorerMockService;
