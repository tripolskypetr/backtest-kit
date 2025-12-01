import { inject } from "../../../lib/core/di";
import { IOptimizerTemplate } from "../../../interfaces/Optimizer.interface";
import LoggerService from "../base/LoggerService";
import TYPES from "../../../lib/core/types";

export class OptimizerTemplateService implements IOptimizerTemplate {
    private readonly loggerService = inject<LoggerService>(TYPES.loggerService);
}

export default OptimizerTemplateService;
