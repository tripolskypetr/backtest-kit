import { singleshot } from "functools-kit";
import { inject } from "../../../lib/core/di";
import LoggerService from "../base/LoggerService";
import TYPES from "../../../lib/core/types";
import { getReadySubject } from "../../../config/emitters";
import { getEnv } from "../../../helpers/getEnv";
import TelegramLogicService from "../logic/TelegramLogicService";
import { getArgs } from "../../../helpers/getArgs";

export class TelegramProviderService {
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  private readonly telegramLogicService = inject<TelegramLogicService>(TYPES.telegramLogicService);

  public enable = singleshot(() => {
    this.loggerService.log("telegramProviderService enable");

    const { CC_TELEGRAM_CHANNEL, CC_TELEGRAM_TOKEN } = getEnv();

    if (!CC_TELEGRAM_CHANNEL) {
      console.log("CC_TELEGRAM_CHANNEL is not set, telegram provider disabled");
      this.enable.clear();
      return;
    }

    if (!CC_TELEGRAM_TOKEN) {
      console.log("CC_TELEGRAM_TOKEN is not set, telegram provider disabled");
      this.enable.clear();
      return;
    }

    return this.telegramLogicService.connect();
  });

  public disable = () => {
    this.loggerService.log("telegramProviderService disable");
    if (this.enable.hasValue()) {
      const lastSubscription = this.enable();
      lastSubscription();
    }
  };

  public connect = singleshot(async () => {
    this.loggerService.log("telegramProviderService connect");
    if (!getArgs().values.telegram) {
      return;
    }
    return getReadySubject().subscribe(this.enable);
  });
}

export default TelegramProviderService;
