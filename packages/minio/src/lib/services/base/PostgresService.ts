import { DataSource } from "typeorm";
import { singleshot, sleep } from "functools-kit";
import { getPostgres } from "../../../config/postgres";
import { inject } from "../../core/di";
import LoggerService from "./LoggerService";
import TYPES from "../../core/types";

const CONNECTION_TIMEOUT = 15_000;
const TIMEOUT_SYMBOL = Symbol("timeout");

export class PostgresService {

  readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  public waitForInit = singleshot(async () => {
    this.loggerService.log("postgresService waitForInit");
    const result = await Promise.race([
      getPostgres(),
      sleep(CONNECTION_TIMEOUT).then(() => TIMEOUT_SYMBOL),
    ]);
    if (result === TIMEOUT_SYMBOL) {
      this.waitForInit.clear();
      throw new Error("Postgres connection timeout");
    }
    this.loggerService.log("postgresService connected to the database");
    return result as DataSource;
  });

  protected init = async () => {
    this.loggerService.log("postgresService init");
    await this.waitForInit();
  };
}

export default PostgresService;
