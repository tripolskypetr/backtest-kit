import { errorData, singleshot } from "functools-kit";
import mongoose, { connect } from "mongoose";
import { getConfig } from "./params";

/**
 * Глобальная валидация required для String (§6): пустая строка `""` — это валидное
 * ЗНАЧЕНИЕ полного документа (дефолт `default: ""`), а НЕ «значения нет». Штатный
 * mongoose-`checkRequired` у String считает `""` отсутствующим (`value.length > 0`),
 * поэтому `create`/upsert с частичным dto (остальные поля добираются дефолтами `""`,
 * §6/UserDbService.create) валится «Path `X` is required». Переопределяем на весь
 * String-тип разом (не по-схемно): required-строка блокирует ТОЛЬКО `null`/`undefined`,
 * а `""` проходит. `v != null` даёт ровно это: `null`→false, `undefined`→false
 * (`undefined == null`), `""`→true. `undefined` остаётся запрещён (§6), пустая строка — ок.
 */
mongoose.Schema.Types.String.checkRequired((value) => value != null);

export const getMongo = singleshot(async () => {

  const GLOBAL_CONFIG = getConfig();

  const mongo = mongoose.connection.readyState === 0
    ? await connect(GLOBAL_CONFIG.CC_MONGO_CONNECTION_STRING)
    : mongoose;

  mongo.connection.once("error", (err) => {
    console.error(errorData(err));
  });

  process.once("SIGINT", async () => {
    await mongo.connection.close();
  });

  return mongo;
});
