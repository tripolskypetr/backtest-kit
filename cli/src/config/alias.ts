/**
 * This file is used to define any aliases for imports in the client code. This is useful for mocking modules during testing or for providing alternative implementations of certain modules.
 * For example, if we want to mock the "pinets" module during testing, we can add an entry to the IMPORT_ALIAS object that points to our mock implementation. Then, when the client code tries to import "pinets", it will receive our mock implementation instead of the actual "pinets" module.
 * This allows us to isolate the client code from external dependencies and test it more effectively.
 * Note that the keys in the IMPORT_ALIAS object should match the module names used in the client code, and the values should be the corresponding mock implementations or alternative modules.
 * @example
 * // To mock the "pinets" module, we can add the following entry to the IMPORT_ALIAS object:
 * Object.assign(IMPORT_ALIAS, {
 *   "pinets": require("pinets/dist/pinets.min.browser.js"),
 * });
 */
export const IMPORT_ALIAS: Record<string, any> = {};
