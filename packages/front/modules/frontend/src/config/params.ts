import { ISize } from "react-declarative";

export const CC_ENABLE_MOCK = !!process.env.CC_ENABLE_MOCK || false;

export const CC_LIST_BUFFER_SIZE = parseInt(process.env.CC_LIST_BUFFER_SIZE) || 25;

export const CC_FORCE_BROWSER_HISTORY =
  !!process.env.CC_FORCE_BROWSER_HISTORY || false;

export const CC_DEFAULT_LIMIT = process.env.CC_DEFAULT_LIMIT
  ? parseInt(process.env.CC_DEFAULT_LIMIT)
  : 25;

export const CC_FULLSCREEN_SIZE_REQUEST = ({ height, width }: ISize) => ({
  height: height - 50,
  width: width - 50,
  sx: {
    maxHeight: "720px",
    maxWidth: "1280px",
  },
});

export const CC_DAYJS_LOCALE = process.env.CC_DAYJS_LOCALE || "RU";

export const CC_SERVICE_NAME = "frontend";

export const CC_WEBHOOK_JWT_SECRET = process.env.CC_WEBHOOK_JWT_SECRET || "TradeGPT";
