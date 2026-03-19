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
import { Button, darken, IconButton, Paper, Stack, SxProps } from "@mui/material";
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
    label: "Symbol",
    minWidth: 115,
    width: (fullWidth) =>
      Math.max(fullWidth - 45 - 90 - 145 - 80 - 90 - 80, 45),
    format: ({ symbol }) => symbol,
  },
  {
    field: "position",
    label: "Position",
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
    label: "Entry",
    minWidth: 145,
    width: () => 145,
    format: ({ buyPrice }) => `${formatAmount(buyPrice)}$`,
  },
  {
    field: "pnlEntries",
    label: "Invested",
    minWidth: 80,
    width: () => 80,
    format: ({ pnlEntries }) => `${formatAmount(pnlEntries)}$`,
  },
  {
    field: "profitLossPercentage",
    label: "PNL %",
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
    label: "PNL $",
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
    title: "Symbol",
    readonly: true,
    compute: (obj) => obj.symbol || "N/A",
  },
  {
    type: FieldType.Text,
    outlined: false,
    desktopColumns: "12",
    tabletColumns: "12",
    phoneColumns: "12",
    name: "position",
    title: "Position",
    readonly: true,
    compute: (obj) => {
      const isLong = obj.position === "long";
      return isLong ? "🔵 LONG (profit on rise)" : "🟠 SHORT (profit on fall)";
    },
  },
  {
    type: FieldType.Text,
    outlined: false,
    desktopColumns: "12",
    tabletColumns: "12",
    phoneColumns: "12",
    name: "date",
    title: "Date",
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
    title: "Entry",
    readonly: true,
    compute: (obj) =>
      obj.buyPrice ? `${formatAmount(obj.buyPrice)}$` : "N/A",
  },
  {
    type: FieldType.Text,
    outlined: false,
    desktopColumns: "12",
    tabletColumns: "12",
    phoneColumns: "12",
    name: "originalBuyPrice",
    title: "Original Entry",
    readonly: true,
    isVisible: (obj) => obj.originalBuyPrice != null && obj.originalBuyPrice !== obj.buyPrice,
    compute: (obj) =>
      obj.originalBuyPrice ? `${formatAmount(obj.originalBuyPrice)}$` : "N/A",
  },
  {
    type: FieldType.Text,
    outlined: false,
    desktopColumns: "12",
    tabletColumns: "12",
    phoneColumns: "12",
    name: "takeProfitPrice",
    title: "Take Profit",
    readonly: true,
    compute: (obj) =>
      obj.takeProfitPrice ? `${formatAmount(obj.takeProfitPrice)}$` : "N/A",
  },
  {
    type: FieldType.Text,
    outlined: false,
    desktopColumns: "12",
    tabletColumns: "12",
    phoneColumns: "12",
    name: "originalTakeProfitPrice",
    title: "Original Take Profit",
    readonly: true,
    isVisible: (obj) => obj.originalTakeProfitPrice != null && obj.originalTakeProfitPrice !== obj.takeProfitPrice,
    compute: (obj) =>
      obj.originalTakeProfitPrice ? `${formatAmount(obj.originalTakeProfitPrice)}$` : "N/A",
  },
  {
    type: FieldType.Text,
    outlined: false,
    desktopColumns: "12",
    tabletColumns: "12",
    phoneColumns: "12",
    name: "stopLossPrice",
    title: "Stop Loss",
    readonly: true,
    compute: (obj) =>
      obj.stopLossPrice ? `${formatAmount(obj.stopLossPrice)}$` : "N/A",
  },
  {
    type: FieldType.Text,
    outlined: false,
    desktopColumns: "12",
    tabletColumns: "12",
    phoneColumns: "12",
    name: "originalStopLossPrice",
    title: "Original Stop Loss",
    readonly: true,
    isVisible: (obj) => obj.originalStopLossPrice != null && obj.originalStopLossPrice !== obj.stopLossPrice,
    compute: (obj) =>
      obj.originalStopLossPrice ? `${formatAmount(obj.originalStopLossPrice)}$` : "N/A",
  },
  {
    type: FieldType.Text,
    outlined: false,
    desktopColumns: "12",
    tabletColumns: "12",
    phoneColumns: "12",
    name: "pnlEntries",
    title: "Invested",
    readonly: true,
    compute: (obj) => `${formatAmount(obj.pnlEntries)}$`,
  },
  {
    type: FieldType.Text,
    outlined: false,
    desktopColumns: "12",
    tabletColumns: "12",
    phoneColumns: "12",
    name: "profitLossPercentage",
    title: "PNL %",
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
    title: "PNL $",
    readonly: true,
    compute: (obj) => {
      const isProfit = obj.pnlCost >= 0;
      return `${isProfit ? "+" : ""}${formatAmount(obj.pnlCost)}$`;
    },
  },
  {
    type: FieldType.Text,
    outlined: false,
    desktopColumns: "12",
    tabletColumns: "12",
    phoneColumns: "12",
    name: "totalEntries",
    title: "Total Entries",
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
    title: "Total Closes",
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
        Back
      </Button>
    ),
  },
];

const row_actions: IGridAction[] = [
  {
    label: "Details",
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
    title: "Info",
    AfterTitle: ({ onClose }) => (
      <Stack direction="row" gap={2}>
        <ActionButton
            onClick={() =>
                ioc.layoutService.pickSignal(selectedRow$.current!.id)
            }
            variant="outlined"
        >
            Show Details
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
          overflow: "hidden",
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
