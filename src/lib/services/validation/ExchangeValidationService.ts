import { inject } from "../../core/di";
import LoggerService from "../base/LoggerService";
import TYPES from "../../core/types";
import { ExchangeName, IExchangeSchema } from "../../../interfaces/Exchange.interface";
import { memoize } from "functools-kit";

/**
 * @class ExchangeValidationService
 * Service for managing and validating exchange configurations
 */
export class ExchangeValidationService {
  /**
   * @private
   * @readonly
   * Injected logger service instance
   */
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  /**
   * @private
   * Map storing exchange schemas by exchange name
   */
  private _exchangeMap = new Map<ExchangeName, IExchangeSchema>();

  /**
   * Adds an exchange schema to the validation service
   * @public
   * @throws {Error} If exchangeName already exists
   */
  public addExchange = (exchangeName: ExchangeName, exchangeSchema: IExchangeSchema): void => {
    this.loggerService.log("exchangeValidationService addExchange", {
      exchangeName,
      exchangeSchema,
    });
    if (this._exchangeMap.has(exchangeName)) {
      throw new Error(`exchange ${exchangeName} already exist`);
    }
    this._exchangeMap.set(exchangeName, exchangeSchema);
  };

  /**
   * Validates the existence of an exchange
   * @public
   * @throws {Error} If exchangeName is not found
   * Memoized function to cache validation results
   */
  public validate = memoize(
    ([exchangeName]) => exchangeName,
    (exchangeName: ExchangeName, source: string): void => {
      this.loggerService.log("exchangeValidationService validate", {
        exchangeName,
        source,
      });
      const exchange = this._exchangeMap.get(exchangeName);
      if (!exchange) {
        throw new Error(
          `exchange ${exchangeName} not found source=${source}`
        );
      }
      return true as never;
    }
  ) as (exchangeName: ExchangeName, source: string) => void;
}

/**
 * @exports ExchangeValidationService
 * Default export of ExchangeValidationService class
 */
export default ExchangeValidationService;
