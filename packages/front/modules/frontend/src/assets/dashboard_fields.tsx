import { FieldType, TypedField } from "react-declarative";
import IMeasure from "../model/Measure.model";
import BackgroundColor from "../widgets/SingleValueWidget/model/BackgroundColor";
import SingleValueWidget from "../widgets/SingleValueWidget";
import { BackgroundMode } from "../widgets/SingleValueWidget/model/BackgroundMode";
import wordForm from "../utils/wordForm";
import SpeedDonutWidget from "../widgets/SpeedDonutWidget";
import SuccessRateWidget from "../widgets/SuccessRateWidget";
import IconPhoto from "../components/common/IconPhoto";
import ChartWidget from "../widgets/ChartWidget";
import SignalGridWidget from "../widgets/SignalGridWidget";

const dashboard_fields: TypedField<IMeasure>[] = [
  {
    type: FieldType.Component,
    desktopColumns: "3",
    tabletColumns: "6",
    phoneColumns: "12",
    fieldRightMargin: "1",
    fieldBottomMargin: "1",
    element: ({ revenueCount }) => {
      const value = revenueCount?.thirtyOneDaysRevenue || 0;
      const count = revenueCount?.thirtyOneDaysCount || 0;
      const backgroundColor =
        value < 0
          ? BackgroundColor.Red
          : value > 0
            ? BackgroundColor.Green
            : BackgroundColor.Orange;
      return (
        <SingleValueWidget
          style={{ height: "max(calc((100dvh - 100px) / 3), 125px)" }}
          value={value}
          backgroundColor={backgroundColor}
          backgroundMode={BackgroundMode.Semi}
          valueUnit="USDT"
          headerLabel="31 день"
          footerLabel="Прибыль за 31 день"
          caption={`${count} ${wordForm(count, {
            one: "сделка",
            two: "сделки",
            many: "сделок",
          })}`}
        />
      );
    },
  },
  {
    type: FieldType.Component,
    desktopColumns: "3",
    tabletColumns: "6",
    phoneColumns: "12",
    fieldRightMargin: "1",
    fieldBottomMargin: "1",
    element: ({ revenueCount }) => {
      const value = revenueCount?.sevenDaysRevenue || 0;
      const count = revenueCount?.sevenDaysCount || 0;
      const backgroundColor =
        value < 0
          ? BackgroundColor.Red
          : value > 0
            ? BackgroundColor.Green
            : BackgroundColor.Orange;
      return (
        <SingleValueWidget
          style={{ height: "max(calc((100dvh - 100px) / 3), 125px)" }}
          value={value}
          backgroundColor={backgroundColor}
          backgroundMode={BackgroundMode.Semi}
          valueUnit="USDT"
          headerLabel="7 дней"
          footerLabel="Прибыль за 7 дней"
          caption={`${count} ${wordForm(count, {
            one: "сделка",
            two: "сделки",
            many: "сделок",
          })}`}
        />
      );
    },
  },
  {
    type: FieldType.Component,
    desktopColumns: "3",
    tabletColumns: "6",
    phoneColumns: "12",
    fieldRightMargin: "1",
    fieldBottomMargin: "1",
    element: ({ revenueCount }) => {
      const value = revenueCount?.yesterdayRevenue || 0;
      const count = revenueCount?.yesterdayCount || 0;
      const backgroundColor =
        value < 0
          ? BackgroundColor.Red
          : value > 0
            ? BackgroundColor.Green
            : BackgroundColor.Orange;
      return (
        <SingleValueWidget
          style={{ height: "max(calc((100dvh - 100px) / 3), 125px)" }}
          value={value}
          backgroundColor={backgroundColor}
          backgroundMode={BackgroundMode.Semi}
          valueUnit="USDT"
          headerLabel="Вчера"
          footerLabel="Прибыль за вчера"
          caption={`${count} ${wordForm(count, {
            one: "сделка",
            two: "сделки",
            many: "сделок",
          })}`}
        />
      );
    },
  },
  {
    type: FieldType.Component,
    desktopColumns: "3",
    tabletColumns: "6",
    phoneColumns: "12",
    fieldRightMargin: "1",
    fieldBottomMargin: "1",
    element: ({ revenueCount }) => {
      const value = revenueCount?.todayRevenue || 0;
      const count = revenueCount?.todayCount || 0;
      const backgroundColor =
        value < 0
          ? BackgroundColor.Red
          : value > 0
            ? BackgroundColor.Green
            : BackgroundColor.Orange;
      return (
        <SingleValueWidget
          style={{ height: "max(calc((100dvh - 100px) / 3), 125px)" }}
          value={value}
          backgroundColor={backgroundColor}
          backgroundMode={BackgroundMode.Semi}
          valueUnit="USDT"
          headerLabel="Сегодня"
          footerLabel="Прибыль за сегодня"
          caption={`${count} ${wordForm(count, {
            one: "сделка",
            two: "сделки",
            many: "сделок",
          })}`}
        />
      );
    },
  },
  {
    type: FieldType.Component,
    desktopColumns: "6",
    tabletColumns: "6",
    phoneColumns: "12",
    fieldRightMargin: "1",
    fieldBottomMargin: "1",
    element: ({ tradePerfomance }) => {
      const items = [
        {
          color: "#DD4049",
          label: "Неудачно",
          maxValue: Math.max(tradePerfomance.rejectedCount + 1, 1),
          value: () => tradePerfomance.rejectedCount,
        },
        {
          color: "#2EA96F",
          label: "Удачно",
          maxValue: Math.max(
            tradePerfomance.rejectedCount + tradePerfomance.resolvedCount + 2,
            2
          ),
          value: () => tradePerfomance.resolvedCount,
        },
        {
          color: "#F3A43A",
          label: "Всего",
          hidden: true,
          maxValue: Math.max(tradePerfomance.total + 3, 3),
          value: () => tradePerfomance.total,
        },
      ];

      return (
        <SpeedDonutWidget
          style={{ height: "max(calc((100dvh - 100px) / 2), 450px)" }}
          items={items}
          valueUnit={wordForm(Math.abs(tradePerfomance.resolvedCount), {
            one: "Удачный cигнал",
            two: "Удачных cигнала",
            many: "Удачных cигналов",
          })}
          value={tradePerfomance.resolvedCount}
        />
      );
    },
  },
  {
    type: FieldType.Component,
    desktopColumns: "6",
    tabletColumns: "6",
    phoneColumns: "12",
    fieldRightMargin: "1",
    fieldBottomMargin: "1",
    element: ({ dailyTrades }) => {
      return (
        <ChartWidget
          sx={{ height: "max(calc((100dvh - 100px) / 2), 450px)" }}
          items={dailyTrades}
        />
      );
    },
  },
  {
    type: FieldType.Component,
    desktopColumns: "6",
    tabletColumns: "6",
    phoneColumns: "12",
    fieldRightMargin: "1",
    fieldBottomMargin: "1",
    element: ({ successRate }) => {
      const items = successRate
        .map(
          ({
            symbol,
            displayName,
            rejectedCloseCount,
            rejectedStopLossCount,
            resolvedCloseCount,
            resolvedTakeProfitCount,
          }) => ({
            title: displayName || symbol,
            description: symbol,
            avatar: () => <IconPhoto symbol={symbol} />,
            done: resolvedTakeProfitCount,
            archive: rejectedStopLossCount,
            waiting: rejectedCloseCount,
            inprogress: resolvedCloseCount,
          })
        )
        .filter(({ done, archive, waiting, inprogress }) => {
          let isOk = false;
          isOk = isOk || !!done;
          isOk = isOk || !!archive;
          isOk = isOk || !!waiting;
          isOk = isOk || !!inprogress;
          return isOk;
        });

      return (
        <SuccessRateWidget
          sx={{ height: "max(calc((100dvh - 100px) / 2), 450px)" }}
          items={items}
        />
      );
    },
  },
  {
    type: FieldType.Component,
    desktopColumns: "6",
    tabletColumns: "6",
    phoneColumns: "12",
    fieldRightMargin: "1",
    fieldBottomMargin: "1",
    element: ({ payload }) => {
      return (
        <SignalGridWidget
          sx={{ height: "max(calc((100dvh - 100px) / 2), 450px)" }}
          mode={payload.mode}
        />
      );
    },
  },
];

export default dashboard_fields;
