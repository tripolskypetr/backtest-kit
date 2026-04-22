import { inject } from "../../../lib/core/di";
import LoggerService from "../base/LoggerService";
import TYPES from "../../../lib/core/types";
import ConfigConnectionService from "../connection/ConfigConnectionService";
import { singleshot } from "functools-kit";
import { NotificationConfig } from "../../../model/Config.model";

const GET_NOTIFICATION_EXPORTS_FN = async (self: ConfigService) => {
  const exports = await self.configConnectionService.loadConfig("notification.config");
  if (!exports) {
    return null;
  }
  return "default" in exports
    ? exports.default
    : exports;
};

const GET_NOTIFICATION_CONFIG_FN = async (self: ConfigService): Promise<NotificationConfig> => {
  const config = await GET_NOTIFICATION_EXPORTS_FN(self);
  if (!config) {
    throw new Error("ConfigService getNotificationConfig `notification.config` is not found");
  }
  if ("notification_config" in config) {
    return config.notification_config;
  }
  return config;
};

export class ConfigService {
  readonly loggerService = inject<LoggerService>(TYPES.loggerService);
  readonly configConnectionService = inject<ConfigConnectionService>(TYPES.configConnectionService);

  public getNotificationConfig = singleshot((): NotificationConfig => {
    throw new Error("ConfigService getNotificationConfig waitForInit is not called");
  });

  public waitForInit = singleshot(async () => {
    this.loggerService.log("configService waitForInit");
    {
      const config = await GET_NOTIFICATION_CONFIG_FN(this);
      this.getNotificationConfig.setValue(config);
    }
  });
}

export default ConfigService;
