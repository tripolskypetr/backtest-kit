import { singleshot } from "functools-kit";
import { Telegraf } from "telegraf";
import { getEnv } from "../helpers/getEnv";
import { kill } from "../utils/notifyKill";

const HEALTH_CHECK_DELAY = 60_000;

let _is_stopped = false;

const handleHealthCheck = singleshot(async (bot: Telegraf) => {
  // Первый чек выполняется синхронно с запуском: ошибка уходит вызывающему
  // getTelegram (бот не стартует, если Telegram недоступен сразу).
  try {
    await bot.telegram.getMe();
  } catch {
    console.log("Bot is offline");
    throw new Error("Telegram goes offline");
  }
  // Периодические чеки: раньше throw внутри setTimeout-цикла становился
  // unhandledRejection (никем не await-ился) и ронял процесс неконтролируемо,
  // оставляя дочерние процессы (UI-сервер) живыми. Теперь — управляемый kill.
  const schedule = () => {
    setTimeout(() => {
      if (_is_stopped) {
        return;
      }
      bot.telegram
        .getMe()
        .then(schedule)
        .catch(() => {
          console.log("Bot is offline");
          kill(-1);
        });
    }, HEALTH_CHECK_DELAY);
  };
  schedule();
});

export const getTelegram = singleshot(async () => {

  if (_is_stopped) {
    throw new Error("Telegram provider is stopped. Restart the process to enable it again.");
  }

  const { CC_TELEGRAM_TOKEN } = await getEnv();

  if (!CC_TELEGRAM_TOKEN) {
    throw new Error(
      "Telegram token is not set. Please set CC_TELEGRAM_TOKEN environment variable.",
    );
  }

  const bot = new Telegraf(CC_TELEGRAM_TOKEN, {
    handlerTimeout: Number.POSITIVE_INFINITY,
  });
  console.log("Bot launching");

  bot.launch({
    allowedUpdates: ["message", "callback_query"],
    dropPendingUpdates: true,
  });

  await handleHealthCheck(bot);

  console.log("Bot launched");

  const sendMessage = async (chatId: string | number, html: string) => {
    const { message_id } = await bot.telegram.sendMessage(chatId, html, {
      parse_mode: "HTML",
      disable_web_page_preview: true,
    });
    return message_id;
  };

  const removeMessage = async (chatId: string | number, messageId: number) => {
    await bot.telegram.deleteMessage(chatId, messageId);
  };

  const sendDocument = async (
    chatId: string | number,
    document: Buffer,
    filename: string,
    caption?: string,
  ) => {
    const { message_id } = await bot.telegram.sendDocument(
      chatId,
      {
        source: document,
        filename,
      },
      {
        caption,
        parse_mode: caption ? "HTML" : undefined,
      },
    );
    return message_id;
  };

  const stopBot = singleshot(() => {
    bot.stop();
    _is_stopped = true;
  })

  return { bot, sendMessage, removeMessage, sendDocument, stopBot };
});
