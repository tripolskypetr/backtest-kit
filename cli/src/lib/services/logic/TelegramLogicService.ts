import { inject } from "../../../lib/core/di";
import LoggerService from "../base/LoggerService";
import TYPES from "../../../lib/core/types";

export class TelegramLogicService {
    private readonly loggerService = inject<LoggerService>(TYPES.loggerService);


}

export default TelegramLogicService;
