import { inject } from "../../../lib/core/di";
import LoggerService from "../base/LoggerService";
import { TYPES } from "../../../lib/core/types";

import {
    Broker,
    Dump,
    Markdown,
    Memory,
    Notification,
    Recent,
    Report,
    State,
    Storage,
    Backtest,
    Live,
    getConfig,
} from "backtest-kit";
import { CC_ENABLE_MOCK } from "src/config/params";
import SetupMockService from "../mock/SetupMockService";

const GET_MODE_FN = async () => {
    const [backtestTarget = null] = await Backtest.list();
    if (backtestTarget) {
        return "backtest";
    }
    const [liveTarget = null] = await Live.list();
    if (liveTarget) {
        return "live";
    }
    return "none";
}

export class SetupViewService {
    private readonly loggerService = inject<LoggerService>(TYPES.loggerService);
    private readonly setupMockService = inject<SetupMockService>(TYPES.setupMockService);   

    public getSetupData = async () => {
        this.loggerService.log("setupViewService getSetupData");
        
        if (CC_ENABLE_MOCK) {
            return await this.setupMockService.getSetupData();
        }

        const broker_enabled = Broker.enable.hasValue();
        const dump_enabled = Dump.enable.hasValue();
        const markdown_enabled = Markdown.enable.hasValue();
        const memory_enabled = Memory.enable.hasValue();
        const notification_enabled = Notification.enable.hasValue();
        const recent_enabled = Recent.enable.hasValue();
        const report_enabled = Report.enable.hasValue();
        const state_enabled = State.enable.hasValue();
        const storage_enabled = Storage.enable.hasValue();
        const running_mode = await GET_MODE_FN();

        const config = await getConfig();

        const enable_long = config.CC_ENABLE_LONG_SIGNAL;
        const enable_short = config.CC_ENABLE_SHORT_SIGNAL;

        return {
            broker_enabled,
            dump_enabled,
            markdown_enabled,
            memory_enabled,
            notification_enabled,
            recent_enabled,
            report_enabled,
            state_enabled,
            storage_enabled,
            running_mode,
            enable_long,
            enable_short,
        };
    }

}

export default SetupViewService;
