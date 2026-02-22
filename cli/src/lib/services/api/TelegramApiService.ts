import { createAwaiter, execpool, queued, sleep, randomString, TIMEOUT_SYMBOL } from "functools-kit";
import { getTelegram } from "../../../config/telegram";
import imageSize from "image-size";
import resizeImg from "resize-image-buffer";
import { Readable } from "stream";
import { Input } from "telegraf";

type InputFile = ReturnType<typeof Input.fromReadableStream>;

type Image = string | InputFile;

const MAX_CAPTION_SYMBOLS = 1024;
const MAX_IMAGE_WIDTH = 1_000;
const MAX_IMAGE_HEIGHT = 1_000;
const MAX_IMAGE_COUNT = 10;

const countAllTagsExceptBr = (html) => {
  if (typeof html !== "string") {
    return 0;
  }
  html = html.replace(/<(?!\/?br\s*\/?)[^>]+>/gi, "");
  html = html.split("</br>").join("");
  html = html.split("<br>").join("\n");
  return html.length;
};

const PROTECT_CONTENT = false;

const PREVENT_FLOOD = 30_000;
const FLOOD_MAX_RETRY = 5;
const MAX_MSG_SYMBOLS = 4096;

const MAX_TIMEOUT_COUNT = 30;

const fetchImage = async (media) => {
  const request = await fetch(media);
  const arrayBuffer = await request.arrayBuffer();
  return Buffer.from(arrayBuffer);
};

const processImageBuffer = async (nodeBuffer: Buffer): Promise<InputFile> => {
  const size = imageSize(<any>nodeBuffer);

  if (size.width > size.height && size.width > MAX_IMAGE_WIDTH) {
    nodeBuffer = await resizeImg(nodeBuffer, { width: MAX_IMAGE_WIDTH });
  }

  if (size.height > size.width && size.height > MAX_IMAGE_HEIGHT) {
    nodeBuffer = await resizeImg(nodeBuffer, { height: MAX_IMAGE_HEIGHT });
  }

  const stream = Readable.from(nodeBuffer);
  return Input.fromReadableStream(stream, `${randomString()}.png`);
};

const getImageFromUrl = execpool(
  async (url: string): Promise<InputFile> => {
    console.log(`Image ${url} fetch begin`);
    const nodeBuffer = await fetchImage(url);
    console.log(`Image ${url} fetch end`);
    return processImageBuffer(nodeBuffer);
  },
  { maxExec: 3 }
);

const processMedia = async (media: string | InputFile): Promise<InputFile> => {
  if (typeof media === 'string') {
    return getImageFromUrl(media);
  }
  return media;
};

const publishInternal = queued(
  async ({
    channel,
    msg,
    images = [],
    onScheduled,
  }: {
    channel: string;
    msg: string;
    images?: Image[];
    onScheduled: () => void;
  }) => {
    const { bot } = await getTelegram();
    console.log("Bot sending");
    onScheduled();
    let isOk = true;
    try {
      const execute = async (retry = 0) => {
        let isImagesPublished = false;
        try {
          if (images?.length) {
            console.log("Bot fetching images");
            const withCaption = countAllTagsExceptBr(msg) < MAX_CAPTION_SYMBOLS;
            console.log(
              `Bot publishing media group withCaption=${withCaption}`
            );
            const imageList = await Promise.all(
              images.slice(0, MAX_IMAGE_COUNT).map(async (media, idx) => ({
                type: "photo",
                media: await processMedia(media),
                ...(idx === 0 &&
                  withCaption && { caption: msg, parse_mode: "HTML" }),
                disable_web_page_preview: true,
              }))
            );
            if (!isImagesPublished) {
              await bot.telegram.sendMediaGroup(channel, <any>imageList, {
                protect_content: PROTECT_CONTENT,
              });
              isImagesPublished = true;
            }
            if (!withCaption) {
              console.log("Bot publishing caption");
              await bot.telegram.sendMessage(channel, msg, {
                protect_content: PROTECT_CONTENT,
                parse_mode: "HTML",
                disable_web_page_preview: true,
              });
            }
          } else {
            console.log("Bot publishing message");
            await bot.telegram.sendMessage(channel, msg, {
              protect_content: PROTECT_CONTENT,
              parse_mode: "HTML",
              disable_web_page_preview: true,
            });
          }
        } catch (error) {
          if (retry >= FLOOD_MAX_RETRY) {
            console.log(`Telegram flood max retry reached retry=${retry}`);
            throw error;
          }
          const retry_after = error?.response?.parameters?.retry_after;
          if (retry_after) {
            console.log(
              `Telegram flood retry=${retry} retry_after=${retry_after}`
            );
            await sleep(retry_after * 1_000 + 1_000);
            await execute(retry + 1);
          } else {
            throw error;
          }
        }
      };
      if (countAllTagsExceptBr(msg) >= MAX_MSG_SYMBOLS) {
        console.log("Box max msg length reached");
        console.log(msg);
        console.log(msg.length);
        throw new Error("Box max msg length reached");
      }
      await execute();
    } catch (error) {
      console.error(error);
      isOk = false;
    } finally {
      await sleep(PREVENT_FLOOD);
      if (isOk) {
        console.log("Bot sent ok");
      } else {
        console.log("Bot sent error");
      }
    }
  }
);

let TIMEOUT_COUNTER = 0;

export class TelegramApiService {
  public publish = async (channel: string, msg: string, images?: Image[]) => {
    const [waitForResult, { resolve }] = createAwaiter<void>();

    const task = publishInternal({
      onScheduled: () => resolve(),
      channel,
      msg,
      images,
    })
    .catch((error) => {
      console.error("Telegram publish failure", {
        error,
      });
      setTimeout(() => process.exit(-1), 5_000);
    });

    const result = await Promise.race([
      waitForResult,
      sleep(5_000).then(() => TIMEOUT_SYMBOL),
    ]);

    if (result === TIMEOUT_SYMBOL) {
      TIMEOUT_COUNTER += 1;
      task.finally(() => {
        TIMEOUT_COUNTER -= 1;
      })
      return "Message scheduled for publication";
    }

    if (TIMEOUT_COUNTER > MAX_TIMEOUT_COUNT) {
      setTimeout(() => process.exit(-1), 5_000);
    }

    return "Message published successfully";
  };
}

export default TelegramApiService;
