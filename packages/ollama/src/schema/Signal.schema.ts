import { str } from "functools-kit";
import { z } from "zod";

/**
 * Zod schema for trading signal structured output.
 *
 * Defines the JSON schema used for LLM-generated trading signals with
 * comprehensive field descriptions and validation rules. Used with outline
 * completion to enforce structured output from language models.
 *
 * Fields:
 * - position: Trading direction (long/short/wait)
 * - price_open: Entry price in USD
 * - price_stop_loss: Stop-loss price in USD
 * - price_take_profit: Take-profit price in USD
 * - minute_estimated_time: Estimated hold duration in minutes
 * - risk_note: Detailed risk assessment with specific metrics
 *
 * @example
 * ```typescript
 * import { SignalSchema } from './schema/Signal.schema';
 *
 * const signal = SignalSchema.parse({
 *   position: 'long',
 *   price_open: 50000,
 *   price_stop_loss: 49000,
 *   price_take_profit: 52000,
 *   minute_estimated_time: 120,
 *   risk_note: 'RSI oversold at 32%, volume spike +45%'
 * });
 * ```
 */
export const SignalSchema = z.object({
  position: z
    .enum(["long", "short", "wait"])
    .describe(
      str.newline(
        "Position direction (ALWAYS required):",
        "long: market shows consistent bullish signals, uptrend or growth potential",
        "short: market shows consistent bearish signals, downtrend or decline potential",
        "wait: conflicting signals between timeframes OR unfavorable trading conditions",
      )
    ),
  price_open: z
    .number()
    .describe(
      str.newline(
        "Position opening price in USD",
        "Use the current market price at the time of analysis"
      )
    ),
  price_stop_loss: z
    .number()
    .describe(
      str.newline(
        "Stop-loss price in USD",
        "For LONG: price below price_open (protection against decline)",
        "For SHORT: price above price_open (protection against rise)",
        "NEVER set SL in 'empty space' without technical justification"
      )
    ),
  price_take_profit: z
    .number()
    .describe(
      str.newline(
        "Take-profit price in USD",
        "For LONG: price above price_open (growth target)",
        "For SHORT: price below price_open (decline target)",
        "NEVER set TP based on trend without technical justification",
      )
    ),
  minute_estimated_time: z
    .number()
    .describe(
      str.newline(
        "Estimated time to reach Take Profit in minutes",
        "Calculated based on HONEST technical analysis, using:",
        "ATR, ADX, MACD, Momentum, Slope and other metrics",
      )
    ),
  risk_note: z
    .string()
    .describe(
      str.newline(
        "Description of current market situation risks:",
        "",
        "Analyze and specify applicable risks:",
        "1. Whale manipulations (volume spikes, long shadows, pin bars, candle engulfing, false breakouts)",
        "2. Order book (order book walls, spoofing, bid/ask imbalance, low liquidity)",
        "3. P&L history (recurring mistakes on similar patterns)",
        "4. Time factors (trading session, low liquidity, upcoming events)",
        "5. Correlations (overall market trend, conflicting trends across timeframes)",
        "6. Technical risks (indicator divergences, weak volumes, critical levels)",
        "7. Gaps and anomalies (price gaps, unfilled gaps, movements without volume)",
        "",
        "Provide SPECIFIC numbers, percentages and probabilities."
      )
    ),
});

/**
 * Inferred type from SignalSchema zod definition.
 * Internal type used for type transformation.
 */
type SignalSchemaInfer = z.infer<typeof SignalSchema>;

/**
 * Trading signal type with all fields required and non-nullable.
 *
 * Represents a validated trading signal returned by LLM providers.
 * All optional/undefined types are excluded to ensure complete signals.
 *
 * @example
 * ```typescript
 * import { TSignalSchema } from '@backtest-kit/ollama';
 *
 * const signal: TSignalSchema = {
 *   position: 'long',
 *   price_open: 50000,
 *   price_stop_loss: 49000,
 *   price_take_profit: 52000,
 *   minute_estimated_time: 120,
 *   risk_note: 'Strong bullish momentum, RSI 68%, volume +32%'
 * };
 * ```
 */
export type TSignalSchema = {
  [K in keyof SignalSchemaInfer]-?: Exclude<SignalSchemaInfer[K], undefined>;
};

export default TSignalSchema;
