import LoggerService from "../lib/services/base/LoggerService";
import { GLOBAL_CONFIG } from "../config/params";
import backtest from "../lib";
import { Lock } from "./Lock";

const METHOD_NAME_ACQUIRE_LOCK = "CandleUtils.acquireLock";
const METHOD_NAME_RELEASE_LOCK = "CandleUtils.releaseLock";

/** Logger service injected as DI singleton */
const LOGGER_SERVICE = new LoggerService();

export class CandleUtils {
  private _lock = new Lock();

  /**
   * Acquires the candle fetch mutex if CC_ENABLE_CANDLE_FETCH_MUTEX is enabled.
   * Prevents concurrent candle fetches from the same exchange.
   *
   * @param source - Caller identifier for logging
   */
  public acquireLock = async (source: string) => {
    LOGGER_SERVICE.info(METHOD_NAME_ACQUIRE_LOCK, {
      source,
    });
    if (!GLOBAL_CONFIG.CC_ENABLE_CANDLE_FETCH_MUTEX) {
      return;
    }
    return await this._lock.acquireLock();
  };

  /**
   * Releases the candle fetch mutex if CC_ENABLE_CANDLE_FETCH_MUTEX is enabled.
   * Must be called after acquireLock, typically in a finally block.
   *
   * @param source - Caller identifier for logging
   */
  public releaseLock = async (source: string) => {
    LOGGER_SERVICE.info(METHOD_NAME_RELEASE_LOCK, {
      source,
    });
    if (!GLOBAL_CONFIG.CC_ENABLE_CANDLE_FETCH_MUTEX) {
      return;
    }
    return await this._lock.releaseLock();
  };
}

export const Candle = new CandleUtils();
