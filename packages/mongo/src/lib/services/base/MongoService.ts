import { ConnectionStates } from "mongoose";

import { errorData, singleshot, sleep } from "functools-kit";
import { inject } from "../../core/di";
import LoggerService from "./LoggerService";
import TYPES from "../../core/types";

import { getMongo } from "../../../config/mongo";

type Mongoose = Awaited<ReturnType<typeof getMongo>>;

const CONNECTED_STATE: ConnectionStates = 1;

const CONNECTION_TIMEOUT = 15_000;
const TIMEOUT_SYMBOL = Symbol("timeout");

const waitForConnect = (mongoose: Mongoose, self: MongooseService) =>
  new Promise<void>((resolve) => {
    mongoose.connection.on("connected", () => {
      self.loggerService.log("mongooseService Mongo connected to the database");
      resolve();
    });
  });

/**
 * Attaches connection lifecycle listeners exactly once.
 * Wrapped in singleshot so waitForInit retries (after a timeout self-clear)
 * do not stack duplicate listeners.
 */
const LISTEN_EVENTS_FN = singleshot(
  (mongoose: Mongoose, self: MongooseService) => {
    mongoose.connection.on("error", (err) => {
      self.loggerService.log("mongooseService Mongo error", {
        error: errorData(err),
      });
      throw new (class extends Error {
        constructor() {
          super("mongooseService Mongo error");
        }
        originalError = errorData(err);
      })();
    });

    mongoose.connection.on("disconnected", () => {
      self.loggerService.log("mongooseService disconnected from the database.");
    });

    mongoose.connection.on("reconnected", () => {
      self.loggerService.log("mongooseService reconnected to the database.");
    });

    process.on("SIGINT", async () => {
      await mongoose.connection.close();
    });
  }
);

/**
 * Lazy Mongo bootstrap: nothing connects at package import time.
 * The connection is dialed on the first `waitForInit()` call, which happens
 * when a persistence adapter is actually used (see utils/waitForInit).
 */
export class MongooseService {

  readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  public waitForInit = singleshot(async () => {
    this.loggerService.log("mongooseService waitForInit");
    const mongoose = await getMongo();
    LISTEN_EVENTS_FN(mongoose, this);
    if (mongoose.connection.readyState === CONNECTED_STATE) {
      return mongoose;
    }
    const result = await Promise.race([
      waitForConnect(mongoose, this),
      sleep(CONNECTION_TIMEOUT).then(() => TIMEOUT_SYMBOL),
    ]);
    if (result === TIMEOUT_SYMBOL) {
      this.waitForInit.clear();
      throw new Error("Mongoose connection timeout");
    }
    return mongoose;
  });
}

export default MongooseService;
