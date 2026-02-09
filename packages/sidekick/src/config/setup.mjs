import {
  Markdown,
  Report,
  Notification,
  Storage,
  setLogger,
  StorageLive,
  StorageBacktest,
  NotificationLive,
  NotificationBacktest,
} from "backtest-kit";
import { serve } from "@backtest-kit/ui";
import { createLogger } from "pinolog";

{
  const logger = createLogger(`backtest-kit.log`);
  setLogger({
    log: (...args) => logger.log(...args),
    debug: (...args) => logger.info(...args),
    info: (...args) => logger.info(...args),
    warn: (...args) => logger.warn(...args),
  });
}

{
  Storage.enable();
  Notification.enable();
}

{
  Markdown.disable();
  Report.enable();
}

{
  StorageLive.usePersist();
  StorageBacktest.usePersist();
}

{
  NotificationLive.usePersist();
  NotificationBacktest.usePersist();
}

serve();
