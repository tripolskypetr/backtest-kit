import { singleshot } from "functools-kit";
import { Telegraf } from "telegraf";
import { getEnv } from "../helpers/getEnv";

const HEALTH_CHECK_DELAY = 60_000;

const handleHealthCheck = singleshot(async (bot: Telegraf) => {
  const fn = async () => {
    try {
      await bot.telegram.getMe();
      setTimeout(fn, HEALTH_CHECK_DELAY);
    } catch (error) {
      console.log("Bot is offline");
      throw new Error("Telegram goes offline");
    }
  };
  await fn();
});

export const getTelegram = singleshot(async () => {
  const { CC_TELEGRAM_TOKEN } = await getEnv();

  if (!CC_TELEGRAM_TOKEN) {
    getTelegram.clear();
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

  return { bot, sendMessage, removeMessage, sendDocument };
});
