import { inject } from "react-declarative";
import LoggerService from "../base/LoggerService";
import TYPES from "../../core/TYPES";
import {
    ExplorerMap,
    ExplorerNode,
    ExplorerRecord,
} from "../../../model/Explorer.model";

const deepFlat = (arr: ExplorerNode[]) => {
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

export class ExplorerHelperService {
    private readonly loggerService = inject<LoggerService>(TYPES.loggerService);

    public treeToRecord(nodes: ExplorerNode[], root = true): ExplorerRecord {
        root && this.loggerService.log("explorerHelperService treeToDict");
        const result: ExplorerRecord = {};
        for (const node of nodes) {
            if (node.type === "directory") {
                result[node.id] = this.treeToRecord(node.nodes, false);
            } else {
                result[node.id] = node.id;
            }
        }
        return result;
    }

    public treeToMap(arr: ExplorerNode[]): ExplorerMap {
        this.loggerService.log("explorerHelperService treeToMap");

        const treeList = deepFlat(arr);

        if (treeList.length === 0) {
            return {};
        }

        return treeList.reduce((acm, cur) => ({ ...acm, [cur.id]: cur }), {});
    }
}

export default ExplorerHelperService;
