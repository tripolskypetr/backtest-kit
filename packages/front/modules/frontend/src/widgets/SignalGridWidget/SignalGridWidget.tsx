import {
  dayjs,
  FieldType,
  formatAmount,
  getErrorMessage,
  Grid,
  IGridColumn,
  sleep,
  TypedField,
  typo,
  useActionModal,
  useActualRef,
  useAlert,
  useAsyncAction,
  useOne,
  singleshot,
  fetchApi,
  randomString,
  Async,
  IGridAction,
  ActionButton,
} from "react-declarative";
import { Box, Button, darken, IconButton, Paper, Stack, SxProps } from "@mui/material";
import { useMemo } from "react";
import {
  ArrowCircleDown,
  ArrowCircleUp,
  AutoFixHigh,
  Circle,
  Close,
} from "@mui/icons-material";
import useSignalOffsetPaginator from "../../api/useSignalOffsetPaginator";
import IconWrapper from "../../components/common/IconWrapper";
import { ISignal } from "../../api/useSignalOffsetPaginator/model/Signal.model";
import ioc from "../../lib";
import { t } from "../../i18n";

interface ISignalGridWidgetProps {
  sx: SxProps;
  mode: "live" | "backtest";
}

interface GridItem extends ISignal {
  id: string;
  color?: never;
}

const columns: IGridColumn<GridItem>[] = [
  {
    field: "color",
    label: typo.nbsp,
    minWidth: 45,
    width: () => 45,
    format: ({ symbol }) => (
      <Async>
        {async () => {
          try {
            const symbolMap = await ioc.symbolGlobalService.getSymbolMap();
            return (
              <Circle
                sx={{
                  color: symbolMap[symbol]?.color || "#ccc",
                }}
              />
            );
          } catch (error) {
            return (
              <Circle
                sx={{
                  color: "#ccc",
                }}
              />
            );
          }
        }}
      </Async>
    ),
  },
  {
    field: "symbol",
    label: t("Symbol"),
    minWidth: 115,
    width: (fullWidth) =>
      Math.max(fullWidth - 45 - 90 - 145 - 80 - 90 - 80, 45),
    format: ({ symbol }) => (
      <Box
        sx={{
          width: "75px",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {symbol}
      </Box>
    ),
  },
  {
    field: "position",
    label: t("Position"),
    minWidth: 90,
    width: () => 90,
    format: ({ position }) => {
      const isLong = position === "long";
      return (
        <span
          style={{
            color: isLong ? "#1976D2" : "#F57C00",
            padding: "4px 8px",
            borderRadius: "4px",
            fontWeight: "bold",
            fontSize: "11px",
          }}
        >
          {isLong ? "🔵 LONG" : "🟠 SHORT"}
        </span>
      );
    },
  },
  {
    field: "buyPrice",
    label: t("Entry"),
    minWidth: 145,
    width: () => 145,
    format: ({ buyPrice }) => `${formatAmount(buyPrice)}${t("$")}`,
  },
  {
    field: "pnlEntries",
    label: t("Invested"),
    minWidth: 80,
    width: () => 80,
    format: ({ pnlEntries }) => `${formatAmount(pnlEntries)}${t("$")}`,
  },
  {
    field: "profitLossPercentage",
    label: t("PNL %"),
    minWidth: 90,
    width: () => 90,
    format: ({ profitLossPercentage }) => {
      const isProfit = profitLossPercentage >= 0;
      return (
        <span style={{ color: isProfit ? "green" : "red" }}>
          {isProfit ? "+" : ""}
          {profitLossPercentage.toFixed(2)}%
        </span>
      );
    },
  },
  {
    field: "pnlCost",
    label: t("PNL $"),
    minWidth: 80,
    width: () => 80,
    format: ({ pnlCost }) => {
      const isProfit = pnlCost >= 0;
      return (
        <span style={{ color: isProfit ? "green" : "red" }}>
          {isProfit ? "+" : ""}
          {formatAmount(pnlCost)}$
        </span>
      );
    },
  },
];

const signal_fields: TypedField[] = [
  {
    type: FieldType.Text,
    outlined: false,
    desktopColumns: "12",
    tabletColumns: "12",
    phoneColumns: "12",
    name: "symbol",
    title: t("Symbol"),
    readonly: true,
    compute: (obj) => obj.symbol || t("N/A"),
  },
  {
    type: FieldType.Text,
    outlined: false,
    desktopColumns: "12",
    tabletColumns: "12",
    phoneColumns: "12",
    name: "position",
    title: t("Position"),
    readonly: true,
    compute: (obj) => {
      const isLong = obj.position === "long";
      return isLong ? `🔵 ${t("LONG (profit on rise)")}` : `🟠 ${t("SHORT (profit on fall)")}`;
    },
  },
  {
    type: FieldType.Text,
    outlined: false,
    desktopColumns: "12",
    tabletColumns: "12",
    phoneColumns: "12",
    name: "date",
    title: t("Date"),
    readonly: true,
    compute: (obj) =>
      obj.date ? dayjs(obj.date).format("DD/MM/YYYY HH:mm") : "",
  },
  {
    type: FieldType.Text,
    outlined: false,
    desktopColumns: "12",
    tabletColumns: "12",
    phoneColumns: "12",
    name: "buyPrice",
    title: t("Entry"),
    readonly: true,
    compute: (obj) =>
      obj.buyPrice ? `${formatAmount(obj.buyPrice)}${t("$")}` : t("N/A"),
  },
  {
    type: FieldType.Text,
    outlined: false,
    desktopColumns: "12",
    tabletColumns: "12",
    phoneColumns: "12",
    name: "originalBuyPrice",
    title: t("Original Entry"),
    readonly: true,
    isVisible: (obj) => obj.originalBuyPrice != null && obj.originalBuyPrice !== obj.buyPrice,
    compute: (obj) =>
      obj.originalBuyPrice ? `${formatAmount(obj.originalBuyPrice)}${t("$")}` : t("N/A"),
  },
  {
    type: FieldType.Text,
    outlined: false,
    desktopColumns: "12",
    tabletColumns: "12",
    phoneColumns: "12",
    name: "takeProfitPrice",
    title: t("Take Profit"),
    readonly: true,
    compute: (obj) =>
      obj.takeProfitPrice ? `${formatAmount(obj.takeProfitPrice)}${t("$")}` : t("N/A"),
  },
  {
    type: FieldType.Text,
    outlined: false,
    desktopColumns: "12",
    tabletColumns: "12",
    phoneColumns: "12",
    name: "originalTakeProfitPrice",
    title: t("Original Take Profit"),
    readonly: true,
    isVisible: (obj) => obj.originalTakeProfitPrice != null && obj.originalTakeProfitPrice !== obj.takeProfitPrice,
    compute: (obj) =>
      obj.originalTakeProfitPrice ? `${formatAmount(obj.originalTakeProfitPrice)}${t("$")}` : t("N/A"),
  },
  {
    type: FieldType.Text,
    outlined: false,
    desktopColumns: "12",
    tabletColumns: "12",
    phoneColumns: "12",
    name: "stopLossPrice",
    title: t("Stop Loss"),
    readonly: true,
    compute: (obj) =>
      obj.stopLossPrice ? `${formatAmount(obj.stopLossPrice)}${t("$")}` : t("N/A"),
  },
  {
    type: FieldType.Text,
    outlined: false,
    desktopColumns: "12",
    tabletColumns: "12",
    phoneColumns: "12",
    name: "originalStopLossPrice",
    title: t("Original Stop Loss"),
    readonly: true,
    isVisible: (obj) => obj.originalStopLossPrice != null && obj.originalStopLossPrice !== obj.stopLossPrice,
    compute: (obj) =>
      obj.originalStopLossPrice ? `${formatAmount(obj.originalStopLossPrice)}${t("$")}` : t("N/A"),
  },
  {
    type: FieldType.Text,
    outlined: false,
    desktopColumns: "12",
    tabletColumns: "12",
    phoneColumns: "12",
    name: "pnlEntries",
    title: t("Invested"),
    readonly: true,
    compute: (obj) => `${formatAmount(obj.pnlEntries)}${t("$")}`,
  },
  {
    type: FieldType.Text,
    outlined: false,
    desktopColumns: "12",
    tabletColumns: "12",
    phoneColumns: "12",
    name: "profitLossPercentage",
    title: t("PNL %"),
    readonly: true,
    trailingIcon: ({ data }) => {
      if (data.profitLossPercentage < 0) {
        return (
          <ArrowCircleDown
            sx={{
              color: "red",
            }}
          />
        );
      }
      return (
        <ArrowCircleUp
          sx={{
            color: "green",
          }}
        />
      );
    },
    compute: (obj) => {
      const isProfit = obj.profitLossPercentage >= 0;
      return `${isProfit ? "+" : ""}${obj.profitLossPercentage.toFixed(2)}%`;
    },
  },
  {
    type: FieldType.Text,
    outlined: false,
    desktopColumns: "12",
    tabletColumns: "12",
    phoneColumns: "12",
    name: "pnlCost",
    title: t("PNL $"),
    readonly: true,
    compute: (obj) => {
      const isProfit = obj.pnlCost >= 0;
      return `${isProfit ? "+" : ""}${formatAmount(obj.pnlCost)}${t("$")}`;
    },
  },
  {
    type: FieldType.Text,
    outlined: false,
    desktopColumns: "12",
    tabletColumns: "12",
    phoneColumns: "12",
    name: "totalEntries",
    title: t("Total Entries"),
    readonly: true,
    isVisible: (obj) => obj.totalEntries != null && obj.totalEntries > 1,
    compute: (obj) => String(obj.totalEntries),
  },
  {
    type: FieldType.Text,
    outlined: false,
    desktopColumns: "12",
    tabletColumns: "12",
    phoneColumns: "12",
    name: "totalPartials",
    title: t("Total Closes"),
    readonly: true,
    isVisible: (obj) => obj.totalPartials != null && obj.totalPartials > 0,
    compute: (obj) => String(obj.totalPartials),
  },
  {
    type: FieldType.Component,
    sx: {
      mt: 2,
    },
    element: ({ payload }) => (
      <Button
        variant="outlined"
        onClick={payload.handleClose}
      >
        {t("Back")}
      </Button>
    ),
  },
];

const row_actions: IGridAction[] = [
  {
    label: t("Details"),
    icon: () => <IconWrapper icon={AutoFixHigh} color="#4caf50" />,
    action: "open-action",
  }
];

export const SignalGridWidget = ({
  sx,
  mode,
}: ISignalGridWidgetProps) => {
  const paginator = useSignalOffsetPaginator(mode);

  const [selectedRow$, setSelectedRow] = useActualRef<ISignal | null>(
    null
  );

  const { pickData, setOpen, render } = useActionModal({
    title: t("Info"),
    AfterTitle: ({ onClose }) => (
      <Stack direction="row" gap={2}>
        <ActionButton
            onClick={() =>
                ioc.layoutService.pickSignal(selectedRow$.current!.id)
            }
            variant="outlined"
        >
            {t("Show Details")}
        </ActionButton>
        <IconButton size="small" onClick={onClose}>
          <Close />
        </IconButton>
      </Stack>
    ),
    payload: () => ({
      handleClose() {
        setOpen(false);
      },
    }),
    fields: signal_fields,
    handler: () => selectedRow$.current,
    withActionButton: false,
  });

  const handleRowClick = (row: ISignal) => {
    setSelectedRow(row);
    pickData(row.id);
  };

  const handleRowAction = (action: string, row: any) => {
    if (action === "open-action") {
      ioc.layoutService.pickSignal(row.id);
    }
  };

  return (
    <>
      <Paper
        sx={{
          display: "flex",
          alignItems: "stretch",
          justifyContent: "stretch",
          flexDirection: "column",
          background: "whitesmote",
          overflow: "clip",
          ...sx,
        }}
      >
        <Grid
          sx={{ flex: 1, background: "transparent !important" }}
          rowColor={({ status }) => status === "pending" ? "#ffc40085" : "transparent"}
          hasMore={paginator.hasMore}
          loading={paginator.loading}
          onSkip={paginator.onSkip}
          data={paginator.data}
          columns={columns}
          rowActions={row_actions}
          onRowClick={handleRowClick}
          onRowAction={handleRowAction}
        />
      </Paper>
      {render()}
    </>
  );
};

export default SignalGridWidget;
