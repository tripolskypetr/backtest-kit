import { inject } from "react-declarative";
import LoggerService from "../base/LoggerService";
import TYPES from "../../core/TYPES";
import { ExplorerNode } from "../../../model/Explorer.model";

export class ExplorerHelperService {
    
    private readonly loggerService = inject<LoggerService>(TYPES.loggerService);

    public *deepFlat(arr: ExplorerNode[]): Generator<ExplorerNode> {
        this.loggerService.log("explorerHelperService deepFlat");
        const seen = new Set<ExplorerNode>();
        const stack: ExplorerNode[] = [...arr];
        while (stack.length) {
            const entry = stack.pop()!;
            if (seen.has(entry)) {
                continue;
            }
            seen.add(entry);
            if (entry.type === "directory") {
                stack.push(...entry.nodes);
            }
            yield entry;
        }
    }
    
}

export default ExplorerHelperService;
