import { FieldType, TypedField } from "react-declarative";
import IBalanceMeasure from "../model/Budget.model";
import BalanceValueWidget, {
  BalanceBackgroundColor,
  BalanceBackgroundMode,
} from "../widgets/BalanceValueWidget";
import BalanceChartWidget from "../widgets/BalanceChartWidget";
import BalanceAssetsWidget from "../widgets/BalanceAssetsWidget";
import BalanceGridWidget from "../widgets/BalanceGridWidget";
import wordForm from "../utils/wordForm";
import { t } from "../i18n";

const balance_fields: TypedField<IBalanceMeasure>[] = [
  {
    type: FieldType.Component,
    desktopColumns: "3",
    tabletColumns: "6",
    phoneColumns: "12",
    fieldRightMargin: "1",
    fieldBottomMargin: "1",
    element: ({ kpi }) => {
      const value = kpi?.capital || 0;
      const realized = kpi?.realized || 0;
      const backgroundColor =
        realized < 0
          ? BalanceBackgroundColor.Red
          : realized > 0
            ? BalanceBackgroundColor.Green
            : BalanceBackgroundColor.Orange;
      return (
        <BalanceValueWidget
          style={{ height: "max(calc((100dvh - 100px) / 3), 275px)" }}
          value={value}
          backgroundColor={backgroundColor}
          backgroundMode={BalanceBackgroundMode.Semi}
          valueUnit={t("$")}
          headerLabel={t("Capital")}
          footerLabel={t("Initial capital plus realized PnL")}
          caption={`${realized >= 0 ? "+" : ""}${realized.toFixed(2)} ${t("realized")}`}
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
    element: ({ kpi }) => {
      const value = kpi?.deployed || 0;
      const count = kpi?.actionCount || 0;
      return (
        <BalanceValueWidget
          style={{ height: "max(calc((100dvh - 100px) / 3), 275px)" }}
          value={value}
          backgroundColor={BalanceBackgroundColor.Blue}
          backgroundMode={BalanceBackgroundMode.Semi}
          valueUnit={t("$")}
          headerLabel={t("Deployed")}
          footerLabel={t("Reserved by open positions")}
          caption={`${count} ${wordForm(count, {
            one: t("action"),
            many: t("actions"),
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
    element: ({ kpi }) => {
      const value = kpi?.free || 0;
      const overdraftTotal = kpi?.overdraftTotal || 0;
      const backgroundColor =
        value < 0
          ? BalanceBackgroundColor.Red
          : value > 0
            ? BalanceBackgroundColor.Green
            : BalanceBackgroundColor.Orange;
      return (
        <BalanceValueWidget
          style={{ height: "max(calc((100dvh - 100px) / 3), 275px)" }}
          value={value}
          backgroundColor={backgroundColor}
          backgroundMode={BalanceBackgroundMode.Semi}
          valueUnit={t("$")}
          headerLabel={t("Free")}
          footerLabel={t("Available for new reserves")}
          caption={overdraftTotal ? `${t("Overdraft total")}: ${overdraftTotal.toFixed(2)}` : t("No overdraft")}
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
    element: ({ kpi }) => {
      const value = kpi?.rejectCount || 0;
      const overdrafts = kpi?.overdraftCount || 0;
      const backgroundColor =
        value > 0 || overdrafts > 0
          ? BalanceBackgroundColor.Red
          : BalanceBackgroundColor.Green;
      return (
        <BalanceValueWidget
          style={{ height: "max(calc((100dvh - 100px) / 3), 275px)" }}
          value={value}
          roundDigits={0}
          backgroundColor={backgroundColor}
          backgroundMode={BalanceBackgroundMode.Semi}
          valueUnit={wordForm(value, {
            one: t("rejection"),
            many: t("rejections"),
          })}
          headerLabel={t("Rejections")}
          footerLabel={t("Refused reserves and withdrawals")}
          caption={`${overdrafts} ${wordForm(overdrafts, {
            one: t("overdraft"),
            many: t("overdrafts"),
          })}`}
        />
      );
    },
  },
  {
    type: FieldType.Component,
    desktopColumns: "8",
    tabletColumns: "12",
    phoneColumns: "12",
    fieldRightMargin: "1",
    fieldBottomMargin: "1",
    element: ({ curve }) => (
      <BalanceChartWidget
        sx={{ height: "max(calc((100dvh - 100px) / 2), 450px)" }}
        items={curve}
      />
    ),
  },
  {
    type: FieldType.Component,
    desktopColumns: "4",
    tabletColumns: "12",
    phoneColumns: "12",
    fieldRightMargin: "1",
    fieldBottomMargin: "1",
    element: ({ assets }) => (
      <BalanceAssetsWidget
        sx={{ height: "max(calc((100dvh - 100px) / 2), 450px)" }}
        items={assets}
      />
    ),
  },
  {
    type: FieldType.Component,
    desktopColumns: "12",
    tabletColumns: "12",
    phoneColumns: "12",
    fieldRightMargin: "1",
    fieldBottomMargin: "1",
    element: ({ history }) => (
      <BalanceGridWidget
        sx={{ height: "max(calc((100dvh - 100px) / 2), 450px)" }}
        items={history}
      />
    ),
  },
];

export default balance_fields;
