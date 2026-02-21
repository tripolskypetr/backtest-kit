import { singleshot } from "functools-kit";
import { serve } from "@backtest-kit/ui";
import { inject } from "../../../lib/core/di";
import LoggerService from "../base/LoggerService";
import TYPES from "../../../lib/core/types";
import { getArgs } from "../../../helpers/getArgs";
import { entrySubject } from "../../../config/emitters";
import { getEnv } from "../../../helpers/getEnv";

export class TelegramProviderService {
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  public enable = singleshot(() => {
    this.loggerService.log("telegramProviderService enable");
    return () => {
    };
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
