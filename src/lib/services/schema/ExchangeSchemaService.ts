import { ExchangeName, IExchangeSchema } from "../../../interfaces/Exchange.interface";
import { inject } from "../../../lib/core/di";
import LoggerService from "../base/LoggerService";
import TYPES from "../../../lib/core/types";
import { ToolRegistry } from "functools-kit";

/**
 * Service for managing exchange schema registry.
 *
 * Uses ToolRegistry from functools-kit for type-safe schema storage.
 * Exchanges are registered via addExchange() and retrieved by name.
 */
export class ExchangeSchemaService {
  readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  private _registry = new ToolRegistry<Record<ExchangeName, IExchangeSchema>>("exchangeSchema");

  /**
   * Registers a new exchange schema.
   *
   * @param key - Unique exchange name
   * @param value - Exchange schema configuration
   * @throws Error if exchange name already exists
   */
  public register = (key: ExchangeName, value: IExchangeSchema) => {
    this.loggerService.info(`exchangeSchemaService register`, { key });
    this.validateShallow(value);
    this._registry = this._registry.register(key, value);
  };

  /**
   * Validates exchange schema structure for required properties.
   *
   * Performs shallow validation to ensure all required properties exist
   * and have correct types before registration in the registry.
   *
   * @param exchangeSchema - Exchange schema to validate
   * @throws Error if exchangeName is missing or not a string
   * @throws Error if getCandles is missing or not a function
   * @throws Error if formatPrice is missing or not a function
   * @throws Error if formatQuantity is missing or not a function
   */
  private validateShallow = (exchangeSchema: IExchangeSchema) => {
    this.loggerService.info(`exchangeSchemaService validateShallow`, {
      exchangeSchema,
    });

    if (typeof exchangeSchema.exchangeName !== "string") {
      throw new Error(
        `exchange schema validation failed: missing exchangeName`
      );
    }

    if (typeof exchangeSchema.getCandles !== "function") {
      throw new Error(
        `exchange schema validation failed: missing getCandles for exchangeName=${exchangeSchema.exchangeName}`
      );
    }

    if (typeof exchangeSchema.formatPrice !== "function") {
      throw new Error(
        `exchange schema validation failed: missing formatPrice for exchangeName=${exchangeSchema.exchangeName}`
      );
    }

    if (typeof exchangeSchema.formatQuantity !== "function") {
      throw new Error(
        `exchange schema validation failed: missing formatQuantity for exchangeName=${exchangeSchema.exchangeName}`
      );
    }
  };

  /**
   * Overrides an existing exchange schema with partial updates.
   *
   * @param key - Exchange name to override
   * @param value - Partial schema updates
   * @returns Updated exchange schema
   * @throws Error if exchange name doesn't exist
   */
  public override = (key: ExchangeName, value: Partial<IExchangeSchema>) => {
    this.loggerService.info(`exchangeSchemaService override`, { key });
    this._registry = this._registry.override(key, value);
    return this._registry.get(key);
  };

  /**
   * Retrieves an exchange schema by name.
   *
   * @param key - Exchange name
   * @returns Exchange schema configuration
   * @throws Error if exchange name doesn't exist
   */
  public get = (key: ExchangeName): IExchangeSchema => {
    this.loggerService.info(`exchangeSchemaService get`, { key });
    return this._registry.get(key);
  };
}

export default ExchangeSchemaService;
