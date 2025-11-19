import { IStrategySchema } from "../../../interfaces/Strategy.interface";
import { inject } from "../../../lib/core/di";
import LoggerService from "../base/LoggerService";
import TYPES from "../../../lib/core/types";

export class StrategySchemaService {

    private readonly loggerService = inject<LoggerService>(TYPES.loggerService);

    private _strategySchema: IStrategySchema;

    public getSchema = () => {
        this.loggerService.log("strategySchemaService getSchema");
        if (!this._strategySchema) {
            throw new Error("StrategySchemaService no strategy provided");
        }
        return this._strategySchema;
    }

    public addSchema = (strategySchema: IStrategySchema) => {
        this.loggerService.log("strategySchemaService addSchema");
        this._strategySchema = strategySchema;
    }

}

export default StrategySchemaService;
