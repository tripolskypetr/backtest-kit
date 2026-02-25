import {
  Breadcrumbs2,
  Breadcrumbs2Type,
  IBreadcrumbs2Action,
  IBreadcrumbs2Option,
  One,
  Subject,
  useAsyncValue,
  useOnce,
} from "react-declarative";
import {
  fetchDailyTradesMeasure,
  fetchSuccessRateMeasure,
  fetchTradePerfomanceMeasure,
  fetchRevenueCountMeasure,
  fetchSymbolList,
  fetchSymbolMap,
  clearSignalCache,
} from "./api";
import ITradePerfomance from "../../../model/TradePerfomance.model";
import IconWrapper from "../../../components/common/IconWrapper";
import { KeyboardArrowLeft, Refresh } from "@mui/icons-material";
import { Container } from "@mui/material";
import { ISuccessRateWithSymbol } from "../../../model/Measure.model";
import IRevenueCount from "../../../model/RevenueCount.model";
import ioc from "../../../lib";
import dashboard_fields from "../../../assets/dashboard_fields";

const INITIAL_TRADE_PERFOMANCE: ITradePerfomance = {
  rejectedCount: 0,
  resolvedCount: 0,
  total: 0,
};

const actions: IBreadcrumbs2Action[] = [
  {
    action: "update-now",
    label: "Refresh manually",
    icon: () => <IconWrapper icon={Refresh} color="#4caf50" />,
  },
];

const options: IBreadcrumbs2Option[] = [
  {
    type: Breadcrumbs2Type.Link,
    action: "back-action",
    label: <KeyboardArrowLeft sx={{ display: "block" }} />,
  },
  {
    type: Breadcrumbs2Type.Link,
    action: "back-action",
    label: "Dashboard",
  },
  {
    type: Breadcrumbs2Type.Link,
    action: "back-action",
    compute: (payload) => `KPI ${String(payload).toUpperCase()}`,
  },
];

const reloadSubject = new Subject<void>();

interface IDashboardPageProps {
  mode: "live" | "backtest";
}

export const DashboardPage = ({
  mode,
}: IDashboardPageProps) => {
  const [data, { loading, execute }] = useAsyncValue(
    async () => {
      const symbolList = await fetchSymbolList();
      const symbolMap = await fetchSymbolMap();

      const dailyTradesMap = new Map<
        number,
        { count: number; resolved: number; rejected: number }
      >();
      const successRate: ISuccessRateWithSymbol[] = [];
      const tradePerfomance: ITradePerfomance = { ...INITIAL_TRADE_PERFOMANCE };
      let totalRevenueCount: IRevenueCount = {
        symbol: "TOTAL",
        todayRevenue: 0,
        yesterdayRevenue: 0,
        sevenDaysRevenue: 0,
        thirtyOneDaysRevenue: 0,
        todayCount: 0,
        yesterdayCount: 0,
        sevenDaysCount: 0,
        thirtyOneDaysCount: 0,
      };

      await Promise.all(
        symbolList.map(async (symbol) => {
          const [
            dailyTradesLocal = [],
            successRateLocal,
            tradePerfomanceLocal,
            revenueCountLocal,
          ] = await Promise.all([
            fetchDailyTradesMeasure(symbol, mode),
            fetchSuccessRateMeasure(symbol, mode),
            fetchTradePerfomanceMeasure(symbol, mode),
            fetchRevenueCountMeasure(symbol, mode),
          ]);

          for (const trade of dailyTradesLocal) {
            const current = dailyTradesMap.get(trade.stamp) || {
              count: 0,
              resolved: 0,
              rejected: 0,
            };
            dailyTradesMap.set(trade.stamp, {
              count: current.count + trade.count,
              resolved: current.resolved + trade.resolved,
              rejected: current.rejected + trade.rejected,
            });
          }

          successRate.push({
            ...successRateLocal,
            symbol,
            displayName: symbolMap[symbol]?.displayName || symbol,
          });

          {
            tradePerfomance.rejectedCount += tradePerfomanceLocal.rejectedCount;
            tradePerfomance.resolvedCount += tradePerfomanceLocal.resolvedCount;
            tradePerfomance.total += tradePerfomanceLocal.total;
          }

          {
            totalRevenueCount.todayRevenue += revenueCountLocal.todayRevenue;
            totalRevenueCount.yesterdayRevenue +=
              revenueCountLocal.yesterdayRevenue;
            totalRevenueCount.sevenDaysRevenue +=
              revenueCountLocal.sevenDaysRevenue;
            totalRevenueCount.thirtyOneDaysRevenue +=
              revenueCountLocal.thirtyOneDaysRevenue;
            totalRevenueCount.todayCount += revenueCountLocal.todayCount;
            totalRevenueCount.yesterdayCount +=
              revenueCountLocal.yesterdayCount;
            totalRevenueCount.sevenDaysCount +=
              revenueCountLocal.sevenDaysCount;
            totalRevenueCount.thirtyOneDaysCount +=
              revenueCountLocal.thirtyOneDaysCount;
          }
        })
      );

      const dailyTrades = Array.from(dailyTradesMap).map(
        ([stamp, { count, resolved, rejected }]) => ({
          stamp,
          count,
          resolved,
          rejected,
        })
      );

      return {
        dailyTrades,
        successRate,
        tradePerfomance,
        revenueCount: totalRevenueCount,
      };
    },
    {
      onLoadStart: () => ioc.layoutService.setModalLoader(true),
      onLoadEnd: () => ioc.layoutService.setModalLoader(false),
      deps: [mode],
    }
  );

  useOnce(() => reloadSubject.subscribe(execute));

  const handleAction = async (action: string) => {
    if (action === "update-now") {
      clearSignalCache();
      await reloadSubject.next();
    }
    if (action === "back-action") {
      ioc.routerService.push("/");
    }
  };

  const renderInner = () => {
    if (!data) {
      return null;
    }
    if (loading) {
      return null;
    }
    return (
      <One
        handler={data}
        payload={() => ({
          handleUpdate() {
            reloadSubject.next();
          },
          mode,
        })}
        fields={dashboard_fields}
      />
    );
  };

  return (
    <Container>
      <Breadcrumbs2 items={options} actions={actions} payload={mode} onAction={handleAction} />
      {renderInner()}
    </Container>
  );
};

export default DashboardPage;
