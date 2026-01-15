import { Markdown, Report, setLogger } from "backtest-kit"
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
  Markdown.disable();
  Report.enable();
}


