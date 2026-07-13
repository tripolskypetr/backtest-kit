import { Client } from "minio";

import {
  getConfig
} from "./params";

export const getMinio = () => {
  const GLOBAL_CONFIG = getConfig();
  return new Client({
    endPoint: GLOBAL_CONFIG.CC_MINIO_ENDPOINT,
    port: GLOBAL_CONFIG.CC_MINIO_PORT,
    accessKey: GLOBAL_CONFIG.CC_MINIO_ACCESSKEY,
    secretKey: GLOBAL_CONFIG.CC_MINIO_SECRETKEY,
    useSSL: false,
  });
};
