import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import os from "os";

const IS_WINDOWS = os.platform() === "win32";

/**
 * Options for configuring the atomic file write operation.
*/
interface Options {
  /** The encoding to use when writing the file (e.g., 'utf8', 'binary'). Defaults to 'utf8'.*/
  encoding?: BufferEncoding | undefined;
  /** The file mode (permissions) as an octal number (e.g., 0o666). Defaults to 0o666.*/
  mode?: number | undefined;
  /** The prefix for the temporary file name. Defaults to '.tmp-'.*/
  tmpPrefix?: string;
}

/**
 * Atomically writes data to a file, ensuring the operation either fully completes or leaves the original file unchanged.
 * Uses a temporary file with a rename strategy on POSIX systems for atomicity, or direct writing with sync on Windows (or when POSIX rename is skipped).
 *
 *
 * @param {string} file - The file parameter.
 * @param {string | Buffer} data - The data to be processed or validated.
 * @param {Options | BufferEncoding} options - The options parameter (optional).
 * @throws {Error} Throws an error if the write, sync, or rename operation fails, after attempting cleanup of temporary files.
 *
 * @example
 * // Basic usage with default options
 * await writeFileAtomic("output.txt", "Hello, world!");
 * // Writes "Hello, world!" to "output.txt" atomically
 *
 * @example
 * // Custom options and Buffer data
 * const buffer = Buffer.from("Binary data");
 * await writeFileAtomic("data.bin", buffer, { encoding: "binary", mode: 0o644, tmpPrefix: "temp-" });
 * // Writes binary data to "data.bin" with custom permissions and temp prefix
 *
 * @example
 * // Using encoding shorthand
 * await writeFileAtomic("log.txt", "Log entry", "utf16le");
 * // Writes "Log entry" to "log.txt" in UTF-16LE encoding
 *
 * @remarks
 * This function ensures atomicity to prevent partial writes:
 * - On POSIX systems (non-Windows, unless `GLOBAL_CONFIG.CC_SKIP_POSIX_RENAME` is true):
 *   - Writes data to a temporary file (e.g., `.tmp-<random>-filename`) in the same directory.
 *   - Uses `crypto.randomBytes` to generate a unique temporary name, reducing collision risk.
 *   - Syncs the data to disk and renames the temporary file to the target file atomically with `fs.rename`.
 *   - Cleans up the temporary file on failure, swallowing cleanup errors to prioritize throwing the original error.
 * - On Windows (or when POSIX rename is skipped):
 *   - Writes directly to the target file, syncing data to disk to minimize corruption risk (though not fully atomic).
 *   - Closes the file handle on failure without additional cleanup.
 * - Accepts `options` as an object or a string (interpreted as `encoding`), defaulting to `{ encoding: "utf8", mode: 0o666, tmpPrefix: ".tmp-" }`.
 * Useful in the agent swarm system for safely writing configuration files, logs, or state data where partial writes could cause corruption.
 *
 * @see {@link https://nodejs.org/api/fs.html#fspromiseswritefilefile-data-options|fs.promises.writeFile} for file writing details.
 * @see {@link https://nodejs.org/api/crypto.html#cryptorandombytessize-callback|crypto.randomBytes} for temporary file naming.
 * @see {@link ../config/params|GLOBAL_CONFIG} for configuration impacting POSIX behavior.
*/
export async function writeFileAtomic(
  file: string,
  data: string | Buffer,
  options: Options | BufferEncoding = {}
) {
  if (typeof options === "string") {
    options = { encoding: options };
  } else if (!options) {
    options = {};
  }

  const { encoding = "utf8", mode = 0o666, tmpPrefix = ".tmp-" } = options;

  let fileHandle: fs.FileHandle = null;

  if (IS_WINDOWS) {
    try {
      // Create and write to temporary file
      fileHandle = await fs.open(file, "w", mode);

      // Write data to the temp file
      await fileHandle.writeFile(data, { encoding });

      // Ensure data is flushed to disk
      await fileHandle.sync();

      // Close the file before rename
      await fileHandle.close();
    } catch (error) {
      // Clean up if something went wrong
      if (fileHandle) {
        await fileHandle.close().catch(() => {});
      }
      throw error; // Re-throw the original error
    }
    return;
  }

  // Create a temporary filename in the same directory
  const dir = path.dirname(file);
  const filename = path.basename(file);
  const tmpFile = path.join(
    dir,
    `${tmpPrefix}${crypto.randomBytes(6).toString("hex")}-${filename}`
  );

  try {
    // Create and write to temporary file
    fileHandle = await fs.open(tmpFile, "w", mode);

    // Write data to the temp file
    await fileHandle.writeFile(data, { encoding });

    // Ensure data is flushed to disk
    await fileHandle.sync();

    // Close the file before rename
    await fileHandle.close();
    fileHandle = null;

    // Atomically replace the target file with our temp file
    await fs.rename(tmpFile, file);
  } catch (error) {
    // Clean up if something went wrong
    if (fileHandle) {
      await fileHandle.close().catch(() => {});
    }

    // Try to remove the temporary file
    try {
      await fs.unlink(tmpFile).catch(() => {});
    } catch (_) {
      // Ignore errors during cleanup
    }

    throw error;
  }
}
