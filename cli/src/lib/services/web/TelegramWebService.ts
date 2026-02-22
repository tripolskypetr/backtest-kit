import { inject } from "../../core/di";
import { TYPES } from "../../core/types";
import { errorData, getErrorMessage, randomString } from "functools-kit";
import TelegramApiService from "../api/TelegramApiService";
import { toTelegramHtml } from "../../../helpers/toTelegramHtml";
import QuickchartApiService from "../api/QuickchartApiService";
import { Readable } from "stream";
import { Input } from "telegraf";
import LoggerService from "../base/LoggerService";
import { getEnv } from "../../../helpers/getEnv";

export class TelegramWebService {
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  private readonly telegramApiService = inject<TelegramApiService>(
    TYPES.telegramApiService,
  );

  private readonly quickchartApiService = inject<QuickchartApiService>(
    TYPES.quickchartApiService,
  );

  public publishNotify = async (dto: { symbol: string; markdown: string }) => {
    this.loggerService.log("telegramWebService publishNotify", {
      dto,
    });
    const { CC_TELEGRAM_TOKEN, CC_TELEGRAM_CHANNEL } = getEnv();
    if (!CC_TELEGRAM_TOKEN || !CC_TELEGRAM_CHANNEL) {
      return;
    }
    const html = toTelegramHtml(dto.markdown);
    try {
      const images = await Promise.all([
        this.quickchartApiService.getChart(dto.symbol, "1m"),
        this.quickchartApiService.getChart(dto.symbol, "15m"),
        this.quickchartApiService.getChart(dto.symbol, "1h"),
      ]);
      await this.telegramApiService.publish(
        CC_TELEGRAM_CHANNEL,
        html,
        images.map((imageBuffer) => {
          const stream = Readable.from(imageBuffer);
          return Input.fromReadableStream(stream, `${randomString()}.png`);
        }),
      );
    } catch (error) {
      this.loggerService.log(
        `telegramWebService publishConfirmNotify Error publishing ${dto.symbol} confirm notify: ${getErrorMessage(error)}`,
        {
          error: errorData(error),
        },
      );
      await this.telegramApiService.publish(CC_TELEGRAM_CHANNEL, html);
    }
  };
}

export default TelegramWebService;
