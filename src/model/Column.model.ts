/**
 * Column configuration for markdown table generation.
 * Generic interface that defines how to extract and format data from any data type.
 *
 * @template T - The data type that this column will format
 *
 * @example
 * ```typescript
 * // Column for formatting signal data
 * const signalColumn: ColumnModel<IStrategyTickResultClosed> = {
 *   key: "pnl",
 *   label: "PNL",
 *   format: (signal) => `${signal.pnl.pnlPercentage.toFixed(2)}%`,
 *   isVisible: () => true
 * };
 *
 * // Column for formatting heatmap rows
 * const heatmapColumn: ColumnModel<IHeatmapRow> = {
 *   key: "symbol",
 *   label: "Symbol",
 *   format: (row) => row.symbol,
 *   isVisible: () => true
 * };
 * ```
 */
export interface ColumnModel<T extends object = any> {
  /** Unique column identifier */
  key: string;

  /** Display label for column header */
  label: string;

  /** Formatting function to convert data to string */
  format: (data: T, index: number) => string | Promise<string>;

  /** Function to determine if column should be visible */
  isVisible: () => boolean | Promise<boolean>;
}
