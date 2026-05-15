import { errorData, singleshot } from "functools-kit";
import mongoose, { connect } from "mongoose";
import { getConfig } from "./params";

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
