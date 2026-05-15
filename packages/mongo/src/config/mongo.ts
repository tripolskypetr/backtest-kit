import { errorData, singleshot } from "functools-kit";
import { connect } from "mongoose";
import { GLOBAL_CONFIG } from "./params";

export const getMongo = singleshot(async () => {
  const mongo = await connect(GLOBAL_CONFIG.CC_MONGO_CONNECTION_STRING);

  mongo.connection.on("error", (err) => {
    throw errorData(err);
  });

  process.on("SIGINT", async () => {
    await mongo.connection.close();
  });

  return mongo;
});
