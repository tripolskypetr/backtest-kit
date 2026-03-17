import LoggerService from "../base/LoggerService";
import TYPES from "../../core/TYPES";
import { fetchApi, inject, randomString, ttl } from "react-declarative";
import {
    CC_CLIENT_ID,
    CC_ENABLE_MOCK,
    CC_SERVICE_NAME,
    CC_USER_ID,
} from "../../../config/params";
import ExplorerMockService from "../mock/ExplorerMockService";
import { ExplorerData, ExplorerNode } from "../../../model/Explorer.model";
import ExplorerHelperService from "../helpers/ExplorerHelperService";

const TTL_TIMEOUT = 45_000;

export class ExplorerViewService {
    private readonly loggerService = inject<LoggerService>(TYPES.loggerService);
    private readonly explorerMockService = inject<ExplorerMockService>(
        TYPES.explorerMockService,
    );
    private readonly explorerHelperService = inject<ExplorerHelperService>(
        TYPES.explorerHelperService,
    );

    private getTreeRaw = ttl(
        async (): Promise<ExplorerNode[]> => {
            this.loggerService.log("explorerViewService getTreeRaw");
            if (CC_ENABLE_MOCK) {
                return await this.explorerMockService.getTreeRaw();
            }
            const { data, error } = await fetchApi(
                "/api/v1/explorer_view/tree",
                {
                    method: "POST",
                    body: JSON.stringify({
                        clientId: CC_CLIENT_ID,
                        serviceName: CC_SERVICE_NAME,
                        userId: CC_USER_ID,
                        requestId: randomString(),
                    }),
                },
            );
            if (error) {
                throw new Error(error);
            }
            return data;
        },
        {
            timeout: TTL_TIMEOUT,
        },
    );

    public getTree = ttl(
        async (): Promise<ExplorerData> => {
            this.loggerService.log("explorerViewService getTree");
            if (CC_ENABLE_MOCK) {
                return await this.explorerMockService.getTree();
            }
            const raw = await this.getTreeRaw();
            return {
                record: this.explorerHelperService.treeToRecord(raw),
                map: this.explorerHelperService.treeToMap(raw),
            };
        },
        {
            timeout: TTL_TIMEOUT,
        },
    );

    public getContent = async (path: string): Promise<string> => {
        this.loggerService.log("explorerViewService getContent", { path });
        if (CC_ENABLE_MOCK) {
            return await this.explorerMockService.getContent(path);
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

    public clear = () => {
        this.loggerService.log("explorerViewService clear");
        if (CC_ENABLE_MOCK) {
            this.explorerMockService.clear();
        }
        this.getTreeRaw.clear();
        this.getTree.clear();
    };
}

export default ExplorerViewService;
