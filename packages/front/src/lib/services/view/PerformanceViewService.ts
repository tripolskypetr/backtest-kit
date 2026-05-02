import { Backtest, Live, Performance } from "backtest-kit";
import { inject } from "../../../lib/core/di";
import LoggerService from "../base/LoggerService";
import { TYPES } from "../../../lib/core/types";
import PerformanceMockService from "../mock/PerformanceMockService";
import { CC_ENABLE_MOCK } from "../../../config/params";

export class PerformanceViewService {
    private readonly loggerService = inject<LoggerService>(TYPES.loggerService);
    private readonly performanceMockService = inject<PerformanceMockService>(TYPES.performanceMockService);

    public getPerformanceData = async () => {
        this.loggerService.log("performanceViewService getPerformanceData");

        if (CC_ENABLE_MOCK) {
            return await this.performanceMockService.getPerformanceData();
        }

        const [backtestItem] = await Backtest.list();
        const [liveItem] = await Live.list();

        if (backtestItem) {
            return await Performance.getData(
                backtestItem.symbol,
                {
                    strategyName: backtestItem.strategyName,
                    exchangeName: backtestItem.exchangeName,
                    frameName: backtestItem.frameName,
                },
                true
            );
        }

        if (liveItem) {
            return await Performance.getData(
                liveItem.symbol,
                {
                    strategyName: liveItem.strategyName,
                    exchangeName: liveItem.exchangeName,
                    frameName: "",
                },
                false
            );
        }

        return null;
    }

    public getPerformanceReport = async () => {
        this.loggerService.log("performanceViewService getPerformanceReport");

        if (CC_ENABLE_MOCK) {
            return await this.performanceMockService.getPerformanceReport();
        }

        const [backtestItem] = await Backtest.list();
        const [liveItem] = await Live.list();

        if (backtestItem) {
            return await Performance.getReport(
                backtestItem.symbol,
                {
                    strategyName: backtestItem.strategyName,
                    exchangeName: backtestItem.exchangeName,
                    frameName: backtestItem.frameName,
                },
                true
            );
        }

        if (liveItem) {
            return await Performance.getReport(
                liveItem.symbol,
                {
                    strategyName: liveItem.strategyName,
                    exchangeName: liveItem.exchangeName,
                    frameName: "",
                },
                false
            );
        }

        return null;
    }

}

export default PerformanceViewService;
