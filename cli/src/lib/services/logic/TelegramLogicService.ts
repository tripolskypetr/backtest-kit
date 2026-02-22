import { inject } from "../../../lib/core/di";
import LoggerService from "../base/LoggerService";
import TYPES from "../../../lib/core/types";
import { singleshot } from "functools-kit";
import { getTelegram } from "src/config/telegram";

export class TelegramLogicService {
    private readonly loggerService = inject<LoggerService>(TYPES.loggerService);

    public connect = singleshot(async () => {
        this.loggerService.log("telegramLogicService connect");

        const { stopBot } = await getTelegram()

        return () => {
            stopBot();
        };
    });
}

export default TelegramLogicService;
