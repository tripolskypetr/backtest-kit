import fs from "fs/promises";
import { singleshot } from "functools-kit";

import { inject } from "../../../lib/core/di";
import LoggerService from "../base/LoggerService";
import { TYPES } from "../../../lib/core/types";
import { ExplorerFileMock, ExplorerNode } from "../../../model/Explorer.model";

const deepFlat = (arr: ExplorerNode[]): ExplorerNode[] => {
  const result: ExplorerNode[] = [];
  const seen = new Set<ExplorerNode>();
  const process = (entries: ExplorerNode[] = []) =>
    entries.forEach((entry) => {
      if (seen.has(entry)) {
        return;
      }
      seen.add(entry);
      if (entry.type === "directory") {
        process(entry.nodes);
      }
      result.push(entry);
    });
  process(arr);
  return result;
};

const MOCK_PATH = "./mock/explorer.json";

const READ_EXPLORER_TREE_FN = singleshot(
  async (): Promise<ExplorerNode[]> => {
    const data = await fs.readFile(MOCK_PATH, "utf-8");
    return JSON.parse(data);
  },
);

const READ_EXPLORER_INDEX_FN = singleshot(
  async (): Promise<Record<string, ExplorerFileMock>> => {
    const tree = await READ_EXPLORER_TREE_FN();
    const treeList = deepFlat(tree);
    if (treeList.length === 0) {
      return {};
    }
    return treeList.reduce((acm, cur) => {
      if (cur.type === "file" && "content" in cur) {
        return { ...acm, [cur.path]: cur as ExplorerFileMock };
      }
      return acm;
    }, {} as Record<string, ExplorerFileMock>);
  },
);

export class ExplorerMockService {
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  public getNode = async (nodePath: string): Promise<string> => {
    this.loggerService.log("explorerMockService getNode", {
      nodePath,
    });
    const index = await READ_EXPLORER_INDEX_FN();
    return index[nodePath]?.content ?? "";
  };

  public getTree = async (): Promise<ExplorerNode[]> => {
    this.loggerService.log("explorerMockService getTree");
    return await READ_EXPLORER_TREE_FN();
  };
}

export default ExplorerMockService;
