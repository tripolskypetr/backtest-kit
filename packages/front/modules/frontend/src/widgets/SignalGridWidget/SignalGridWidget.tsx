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
      Math.max(fullWidth - 100 - 100 - 100 - 80 - 45 - 100 - 90, 45),
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
    label: "Buy price",
    minWidth: 145,
    width: () => 145,
    format: ({ buyPrice }) => `${formatAmount(buyPrice)}$`,
  },
  {
    field: "totalEntries",
    label: "DCA",
    minWidth: 80,
    width: () => 80,
  },
  {
    field: "profitLossPercentage",
    label: "%",
    minWidth: 80,
    width: () => 80,
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
    name: "profitLossPercentage",
    title: "Profit/Loss",
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
      if (obj.profitLossPercentage !== undefined) {
        const isProfit = obj.profitLossPercentage >= 0;
        return `${isProfit ? "+" : ""}${obj.profitLossPercentage.toFixed(2)}%`;
      }
      return "N/A";
    },
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
    name: "totalEntries",
    title: "DCA Entries",
    readonly: true,
    isVisible: (obj) => obj.totalEntries != null && obj.totalEntries > 1,
    compute: (obj) =>
      obj.totalEntries != null ? String(obj.totalEntries) : "N/A",
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
