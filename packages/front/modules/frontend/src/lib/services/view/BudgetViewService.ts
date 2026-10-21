import LoggerService from "../base/LoggerService";
import TYPES from "../../core/TYPES";
import { fetchApi, inject, randomString } from "react-declarative";
import { ttl } from "../../../utils/ttl";
import {
    CC_CLIENT_ID,
    CC_ENABLE_MOCK,
    CC_SERVICE_NAME,
    CC_USER_ID,
} from "../../../config/params";
import BudgetMockService from "../mock/BudgetMockService";
import { IBudgetViewContext, TBudgetBalance, TBudgetHistoryRow } from "../../../model/Budget.model";

const TTL_TIMEOUT = 5_000;

export class BudgetViewService {
    private readonly loggerService = inject<LoggerService>(TYPES.loggerService);
    private readonly budgetMockService = inject<BudgetMockService>(
        TYPES.budgetMockService,
    );

    public getBalance = ttl(
        async (context: IBudgetViewContext, when: number): Promise<TBudgetBalance> => {
            this.loggerService.log("budgetViewService getBalance", { context, when });
            if (CC_ENABLE_MOCK) {
                return await this.budgetMockService.getBalance(context, when);
            }
            const { data, error } = await fetchApi("/api/v1/view/budget_balance", {
                method: "POST",
                body: JSON.stringify({
                    clientId: CC_CLIENT_ID,
                    serviceName: CC_SERVICE_NAME,
                    userId: CC_USER_ID,
                    requestId: randomString(),
                    context,
                    when,
                }),
            });
            if (error) {
                throw new Error(error);
            }
            return data;
        },
        {
            timeout: TTL_TIMEOUT,
            key: ([context]) => `${context.strategyName}-${context.exchangeName}-${context.frameName}`,
        },
    );

    public getHistory = ttl(
        async (context: IBudgetViewContext, when: number): Promise<TBudgetHistoryRow[]> => {
            this.loggerService.log("budgetViewService getHistory", { context, when });
            if (CC_ENABLE_MOCK) {
                return await this.budgetMockService.getHistory(context, when);
            }
            const { data, error } = await fetchApi("/api/v1/view/budget_history", {
                method: "POST",
                body: JSON.stringify({
                    clientId: CC_CLIENT_ID,
                    serviceName: CC_SERVICE_NAME,
                    userId: CC_USER_ID,
                    requestId: randomString(),
                    context,
                    when,
                }),
            });
            if (error) {
                throw new Error(error);
            }
            return data;
        },
        {
            timeout: TTL_TIMEOUT,
            key: ([context]) => `${context.strategyName}-${context.exchangeName}-${context.frameName}`,
        },
    );
}

export default BudgetViewService;
