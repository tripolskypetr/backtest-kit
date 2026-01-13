import { ILogger } from "src/interfaces/Logger.interface";

const NOOP_LOGGER: ILogger = {
  log() {
    void 0;
  },
  debug() {
    void 0;
  },
  info() {
    void 0;
  },
  warn() {
    void 0;
  },
};

export class LoggerService implements ILogger {
  private _commonLogger: ILogger = NOOP_LOGGER;

  public log = async (topic: string, ...args: any[]) => {
    await this._commonLogger.log(
      topic,
      ...args,
    );
  };

  public debug = async (topic: string, ...args: any[]) => {
    await this._commonLogger.debug(
      topic,
      ...args,
    );
  };

  public info = async (topic: string, ...args: any[]) => {
    await this._commonLogger.info(
      topic,
      ...args,
    );
  };

  public warn = async (topic: string, ...args: any[]) => {
    await this._commonLogger.warn(
      topic,
      ...args,
    );
  };

  public setLogger = (logger: ILogger) => {
    this._commonLogger = logger;
  };
}

export default LoggerService;
