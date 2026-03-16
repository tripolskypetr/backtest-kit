import fs from "fs/promises";
import path from "path";
import mime from "mime-types";
import { singleshot } from "functools-kit";

import LoggerService from "../base/LoggerService";
import { TYPES } from "../../../lib/core/types";
import { inject } from "../../../lib/core/di";
import { ExplorerDirectory, ExplorerNode } from "../../../model/Explorer.model";
import { CC_ENABLE_MOCK } from "../../../config/params";
import ExplorerMockService from "../mock/ExplorerMockService";

const DUMP_DIR = path.join(process.cwd(), "dump");

const buildTree = async (
  dir: string,
  visited: Set<string>,
): Promise<ExplorerNode[]> => {
  const realDir = await fs.realpath(dir);
  if (visited.has(realDir)) {
    return [];
  }
  visited.add(realDir);
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const nodes: ExplorerNode[] = [];
  for (const entry of entries) {
    const childPath = path.join(dir, entry.name);
    const childRelPath = path.relative(process.cwd(), childPath);
    if (entry.isDirectory()) {
      nodes.push({
        path: childRelPath,
        label: entry.name,
        type: "directory",
        nodes: await buildTree(childPath, visited),
      });
    } else {
      nodes.push({
        path: childRelPath,
        label: entry.name,
        type: "file",
        mimeType: mime.lookup(entry.name) || "application/octet-stream",
      });
    }
  }
  return nodes;
};

export class ExplorerViewService {
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);
  private readonly explorerMockService = inject<ExplorerMockService>(
    TYPES.explorerMockService,
  );

  public getTree = async (): Promise<ExplorerNode[]> => {
    this.loggerService.log("explorerViewService getTree");
    if (CC_ENABLE_MOCK) {
      return await this.explorerMockService.getTree();
    }
    const rootNode: ExplorerDirectory = {
      path: path.relative(process.cwd(), DUMP_DIR),
      label: path.basename(DUMP_DIR),
      type: "directory",
      nodes: await buildTree(DUMP_DIR, new Set()),
    };
    return [rootNode];
  };

  protected init = singleshot(async () => {
    this.loggerService.log("explorerViewService init");
    if (CC_ENABLE_MOCK) {
      return;
    }
    await fs.mkdir(DUMP_DIR, { recursive: true });
  });
}

export default ExplorerViewService;
