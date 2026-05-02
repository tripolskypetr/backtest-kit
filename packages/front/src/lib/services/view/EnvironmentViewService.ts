import { TYPES } from "../../../lib/core/types";
import { inject } from "../../../lib/core/di";
import LoggerService from "../base/LoggerService";
import {
    CC_ENABLE_MOCK,
    CC_QUICKCHART_HOST,
    CC_TELEGRAM_CHANNEL,
    CC_WWWROOT_HOST,
    CC_WWWROOT_PATH,
    CC_WWWROOT_PORT,
} from "../../../config/params";
import EnvironmentMockService from "../mock/EnvironmentMockService";

export class EnvironmentViewService {
    private readonly loggerService = inject<LoggerService>(TYPES.loggerService);
    private readonly enviromentMockService = inject<EnvironmentMockService>(TYPES.environmentMockService);

    public getEnvironmentData = async () => {
        this.loggerService.log("environmentViewService getEnvironmentData");
        if (CC_ENABLE_MOCK) {
            return await this.enviromentMockService.getEnvironmentData();
        }
        return {
            quickchart_host: CC_QUICKCHART_HOST,
            telegram_channel: CC_TELEGRAM_CHANNEL,
            wwwroot_host: CC_WWWROOT_HOST,
            wwwroot_path: CC_WWWROOT_PATH,
            wwwroot_port: CC_WWWROOT_PORT,
        }
    }

}

export default EnvironmentViewService;
