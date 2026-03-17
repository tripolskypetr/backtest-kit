import fs from "fs/promises";
import path from "path";
import mime from "mime-types";
import { createHash } from "crypto";
import { singleshot } from "functools-kit";
import LoggerService from "../base/LoggerService";
import { TYPES } from "../../../lib/core/types";
import { inject } from "../../../lib/core/di";
import { ExplorerDirectory, ExplorerNode } from "../../../model/Explorer.model";
import { CC_ENABLE_MOCK } from "../../../config/params";
import ExplorerMockService from "../mock/ExplorerMockService";

const pathId = (p: string) => createHash("sha1").update(p).digest("hex").slice(0, 16);

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
    const childRelPath = path.relative(process.cwd(), childPath).replace(/\\/g, "/");
    if (entry.isDirectory()) {
      nodes.push({
        id: pathId(childRelPath),
        path: childRelPath,
        label: entry.name,
        type: "directory",
        nodes: await buildTree(childPath, visited),
      });
    } else {
      nodes.push({
        id: pathId(childRelPath),
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

  private getDir = singleshot(async () => {
    this.loggerService.log("explorerViewService getDir");
    const dir = path.join(process.cwd(), "dump");
    await fs.mkdir(dir, { recursive: true });
    return dir;
  });

  public getNode = async (nodePath: string): Promise<string> => {
    this.loggerService.log("explorerViewService getNode", {
      nodePath,
    });
    if (CC_ENABLE_MOCK) {
      return await this.explorerMockService.getNode(nodePath);
    }
    const dir = await this.getDir();
    const absPath = path.resolve(process.cwd(), nodePath);
    if (!absPath.startsWith(dir + path.sep) && !absPath.startsWith(dir + "/") && absPath !== dir) {
      throw new Error(`Path is outside of dump dir: ${nodePath}`);
    }
    return await fs.readFile(absPath, "utf-8");
  };

  public getTree = async (): Promise<ExplorerNode[]> => {
    this.loggerService.log("explorerViewService getTree");
    if (CC_ENABLE_MOCK) {
      return await this.explorerMockService.getTree();
    }
    const dir = await this.getDir();
    const root = path.relative(process.cwd(), dir).replace(/\\/g, "/");
    const rootNode: ExplorerDirectory = {
      id: pathId(root),
      path: root,
      label: path.basename(root),
      type: "directory",
      nodes: await buildTree(dir, new Set([path.join(dir, "data")])),
    };
    return [rootNode];
  };
}

export default ExplorerViewService;
