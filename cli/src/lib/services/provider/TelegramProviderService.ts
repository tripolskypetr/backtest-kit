import { singleshot } from "functools-kit";
import { inject } from "../../../lib/core/di";
import LoggerService from "../base/LoggerService";
import TYPES from "../../../lib/core/types";
import { entrySubject } from "../../../config/emitters";
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

    let disposeFn: Function;

    const main = async () => {
      disposeFn = await this.telegramLogicService.connect();
    };

    main();

    return () => {
      disposeFn && disposeFn();
    }
  });

  public disable = () => {
    this.loggerService.log("telegramProviderService disable");
    if (this.enable.hasValue()) {
      const lastSubscription = this.enable();
      lastSubscription();
    }
  };

  public init = singleshot(async () => {
    this.loggerService.log("telegramProviderService init");
    if (!getArgs().values.telegram) {
      return;
    }
    entrySubject.subscribe(this.enable);
  });
}

export default TelegramProviderService;
