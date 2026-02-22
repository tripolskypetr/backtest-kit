import { singleshot } from "functools-kit";
import { entrySubject } from "../config/emitters";

export const getEnv = singleshot(() => {
  if (!entrySubject.data) {
    getEnv.clear();
  }
  return {
    CC_TELEGRAM_TOKEN: process.env.CC_TELEGRAM_TOKEN || "",
    CC_TELEGRAM_CHANNEL: process.env.CC_TELEGRAM_CHANNEL || "",
    CC_WWWROOT_HOST: process.env.CC_WWWROOT_HOST || "0.0.0.0",
    CC_WWWROOT_PORT: parseInt(process.env.CC_WWWROOT_PORT) || 60050,
    CC_QUICKCHART_HOST: process.env.CC_QUICKCHART_HOST || "",
  };
});
