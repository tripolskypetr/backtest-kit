import { inject } from "../../core/di";
import LoggerService from "../base/LoggerService";
import TYPES from "../../core/types";
import { SizingName, ISizingCalculateParams, ISizing } from "../../../interfaces/Sizing.interface";
import { memoize } from "functools-kit";
import ClientSizing from "../../../client/ClientSizing";
import SizingSchemaService from "../schema/SizingSchemaService";

/**
 * Type definition for sizing methods.
 * Maps all keys of ISizing to any type.
 * Used for dynamic method routing in SizingConnectionService.
 */
type TSizing = {
  [key in keyof ISizing]: any;
}

/**
 * Connection service routing sizing operations to correct ClientSizing instance.
 *
 * Routes sizing method calls to the appropriate sizing implementation
 * based on the provided sizingName parameter. Uses memoization to cache
 * ClientSizing instances for performance.
 *
 * Key features:
 * - Explicit sizing routing via sizingName parameter
 * - Memoized ClientSizing instances by sizingName
 * - Position size calculation with risk management
 *
 * Note: sizingName is empty string for strategies without sizing configuration.
 *
 * @example
 * ```typescript
 * // Used internally by framework
 * const quantity = await sizingConnectionService.calculate(
 *   {
 *     symbol: "BTCUSDT",
 *     accountBalance: 10000,
 *     priceOpen: 50000,
 *     priceStopLoss: 49000,
 *     method: "fixed-percentage"
 *   },
 *   { sizingName: "conservative" }
 * );
 * ```
 */
export class SizingConnectionService implements TSizing {
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);
  private readonly sizingSchemaService = inject<SizingSchemaService>(
    TYPES.sizingSchemaService
  );

  /**
   * Retrieves memoized ClientSizing instance for given sizing name.
   *
   * Creates ClientSizing on first call, returns cached instance on subsequent calls.
   * Cache key is sizingName string.
   *
   * @param sizingName - Name of registered sizing schema
   * @returns Configured ClientSizing instance
   */
  public getSizing = memoize(
    ([sizingName]) => `${sizingName}`,
    (sizingName: SizingName) => {
      const schema = this.sizingSchemaService.get(sizingName);
      return new ClientSizing({
        ...schema,
        logger: this.loggerService,
      });
    }
  );

  /**
   * Calculates position size based on risk parameters and configured method.
   *
   * Routes to appropriate ClientSizing instance based on provided context.
   * Supports multiple sizing methods: fixed-percentage, kelly-criterion, atr-based.
   *
   * @param params - Calculation parameters (symbol, balance, prices, method-specific data)
   * @param context - Execution context with sizing name
   * @returns Promise resolving to calculated position size
   */
  public calculate = async (
    params: ISizingCalculateParams,
    context: { sizingName: SizingName }
  ) => {
    this.loggerService.log("sizingConnectionService calculate", {
      symbol: params.symbol,
      method: params.method,
      context,
    });
    return await this.getSizing(context.sizingName).calculate(params);
  };
}

export default SizingConnectionService;
