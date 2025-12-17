import { inject } from "../../../lib/core/di";
import LoggerService from "../base/LoggerService";
import TYPES from "../../../lib/core/types";
import { COLUMN_CONFIG } from "../../../config/columns";
import { ColumnModel } from "../../../model/Column.model";

/**
 * Service for validating column configurations to ensure consistency with ColumnModel interface
 * and prevent invalid column definitions.
 *
 * Performs comprehensive validation on all column definitions in COLUMN_CONFIG:
 * - **Required fields**: All columns must have key, label, format, and isVisible properties
 * - **Unique keys**: All key values must be unique within each column collection
 * - **Function validation**: format and isVisible must be callable functions
 * - **Data types**: key and label must be non-empty strings
 *
 * @throws {Error} If any validation fails, throws with detailed breakdown of all errors
 *
 * @example
 * ```typescript
 * const validator = new ColumnValidationService();
 * validator.validate(); // Throws if column configuration is invalid
 * ```
 *
 * @example Validation failure output:
 * ```
 * Column configuration validation failed:
 *   1. backtest_columns[0]: Missing required field "format"
 *   2. heat_columns: Duplicate key "symbol" at indexes 1, 5
 *   3. live_columns[3].isVisible must be a function, got "boolean"
 * ```
 */
export class ColumnValidationService {
  /**
   * @private
   * @readonly
   * Injected logger service instance
   */
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  /**
   * Validates all column configurations in COLUMN_CONFIG for structural correctness.
   *
   * Checks:
   * 1. All required fields (key, label, format, isVisible) are present in each column
   * 2. key and label are non-empty strings
   * 3. format and isVisible are functions (not other types)
   * 4. All keys are unique within each column collection
   *
   * @throws Error if configuration is invalid
   */
  public validate = () => {
    this.loggerService.log("columnValidationService validate");

    const errors: string[] = [];

    // Iterate through all column collections in COLUMN_CONFIG
    for (const [configKey, columns] of Object.entries(COLUMN_CONFIG)) {
      if (!Array.isArray(columns)) {
        errors.push(`${configKey} is not an array, got ${typeof columns}`);
        continue;
      }

      // Track keys for uniqueness check
      const keyMap = new Map<string, number[]>();

      // Validate each column in the collection
      columns.forEach((column, index) => {
        if (!column || typeof column !== "object") {
          errors.push(`${configKey}[${index}]: Column must be an object, got ${typeof column}`);
          return;
        }

        // Check for all required fields
        const requiredFields = ["key", "label", "format", "isVisible"];
        for (const field of requiredFields) {
          if (!(field in column)) {
            errors.push(`${configKey}[${index}]: Missing required field "${field}"`);
          }
        }

        // Validate key and label are non-empty strings
        if (typeof column.key !== "string" || column.key.trim() === "") {
          errors.push(
            `${configKey}[${index}].key must be a non-empty string, got ${
              typeof column.key === "string" ? `"${column.key}"` : typeof column.key
            }`
          );
        } else {
          // Track key for uniqueness check
          if (!keyMap.has(column.key)) {
            keyMap.set(column.key, []);
          }
          keyMap.get(column.key)!.push(index);
        }

        if (typeof column.label !== "string" || column.label.trim() === "") {
          errors.push(
            `${configKey}[${index}].label must be a non-empty string, got ${
              typeof column.label === "string" ? `"${column.label}"` : typeof column.label
            }`
          );
        }

        // Validate format is a function
        if (typeof column.format !== "function") {
          errors.push(
            `${configKey}[${index}].format must be a function, got "${typeof column.format}"`
          );
        }

        // Validate isVisible is a function
        if (typeof column.isVisible !== "function") {
          errors.push(
            `${configKey}[${index}].isVisible must be a function, got "${typeof column.isVisible}"`
          );
        }
      });

      // Check for duplicate keys
      for (const [key, indexes] of keyMap.entries()) {
        if (indexes.length > 1) {
          errors.push(
            `${configKey}: Duplicate key "${key}" at indexes ${indexes.join(", ")}`
          );
        }
      }
    }

    // Throw aggregated errors if any
    if (errors.length > 0) {
      const errorMessage = `Column configuration validation failed:\n${errors
        .map((e, i) => `  ${i + 1}. ${e}`)
        .join("\n")}`;
      this.loggerService.warn(errorMessage);
      throw new Error(errorMessage);
    }

    this.loggerService.log("columnValidationService validation passed");
  };
}

export default ColumnValidationService;
