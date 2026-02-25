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
  Delete,
  Info,
} from "@mui/icons-material";
import { defaultSlots } from "../../components/OneSlotFactory";
import { commitCloseSignal, commitRemoveSignal } from "./api";
import useSignalOffsetPaginator from "../../api/useSignalOffsetPaginator";
import IconWrapper from "../../components/common/IconWrapper";
import { ISignal } from "../../api/useSignalOffsetPaginator/model/Signal.model";
import ioc from "../../lib";

const ADMIN_PASS = "88888888";

interface ISignalGridWidgetProps {
  onUpdate: () => void;
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
    label: "Символ",
    minWidth: 115,
    width: (fullWidth) =>
      Math.max(fullWidth - 100 - 100 - 100 - 80 - 45 - 100 - 90, 45),
    format: ({ symbol }) => symbol,
  },
  {
    field: "position",
    label: "Позиция",
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
    label: "Цена покупки",
    minWidth: 145,
    width: () => 145,
    format: ({ buyPrice }) => `${formatAmount(buyPrice)}$`,
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
    title: "Символ",
    readonly: true,
    compute: (obj) => obj.symbol || "Не указан",
  },
  {
    type: FieldType.Text,
    outlined: false,
    desktopColumns: "12",
    tabletColumns: "12",
    phoneColumns: "12",
    name: "position",
    title: "Позиция",
    readonly: true,
    compute: (obj) => {
      const isLong = obj.position === "long";
      return isLong ? "🔵 LONG (прибыль при росте)" : "🟠 SHORT (прибыль при падении)";
    },
  },
  {
    type: FieldType.Text,
    outlined: false,
    desktopColumns: "12",
    tabletColumns: "12",
    phoneColumns: "12",
    name: "date",
    title: "Дата",
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
    title: "Прибыль/Убыток",
    readonly: true,
    trailingIcon: ({ data }) => {
      if (data.profitLoss < 0) {
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
      return "Не указан";
    },
  },
  {
    type: FieldType.Text,
    outlined: false,
    desktopColumns: "12",
    tabletColumns: "12",
    phoneColumns: "12",
    name: "buyPrice",
    title: "Цена покупки",
    readonly: true,
    compute: (obj) =>
      obj.buyPrice ? `${formatAmount(obj.buyPrice)}$` : "Не указана",
  },
  {
    type: FieldType.Component,
    sx: {
      mt: 2,
    },
    element: ({ status, payload }) => (
      <Button
        variant="contained"
        disabled={status !== "pending"}
        sx={{
          background: "#f44336",
          "&:hover": { background: darken("#f44336", 0.2) },
          color: "white",
        }}
        onClick={payload.handleCloseSignal}
      >
        Продать актив
      </Button>
    ),
  },
];

const cancel_fields: TypedField[] = [
  {
    type: FieldType.Text,
    validation: {
      required: true,
    },
    name: "password",
    inputType: "password",
    title: "Пароль администратора",
  },
  {
    type: FieldType.Text,
    validation: {
      required: true,
    },
    inputRows: 5,
    name: "comment",
    title: "Причина закрытия",
  },
];

const remove_fields: TypedField[] = [
  {
    type: FieldType.Text,
    validation: {
      required: true,
    },
    name: "password",
    inputType: "password",
    title: "Пароль администратора",
  },
  {
    type: FieldType.Text,
    validation: {
      required: true,
    },
    inputRows: 5,
    name: "comment",
    title: "Причина удаления",
  },
];

const row_actions: IGridAction[] = [
  {
    label: "Детали",
    icon: () => <IconWrapper icon={AutoFixHigh} color="#4caf50" />,
    action: "open-action",
  }
];

export const SignalGridWidget = ({
  sx,
  onUpdate,
  mode,
}: ISignalGridWidgetProps) => {
  const paginator = useSignalOffsetPaginator(mode);

  const [selectedRow$, setSelectedRow] = useActualRef<ISignal | null>(
    null
  );

  const pickAlert = useAlert({
    title: "Статус",
    large: true,
  });

  const pickCloseOne = useOne({
    title: "Закрытие сигнала",
    fields: cancel_fields,
    slots: defaultSlots,
  });

  const pickRemoveOne = useOne({
    title: "Удаление сигнала",
    fields: remove_fields,
    slots: defaultSlots,
  });

  const { execute: closeSignal } = useAsyncAction(
    async (dto: { signalId: string; comment: string }) => {
      try {
        await commitCloseSignal(dto.signalId, dto.comment);
        await sleep(1_000);
        pickAlert({
          description: "Сигнал закрыт успешно!",
        }).then(onUpdate);
      } catch (error) {
        pickAlert({
          description: getErrorMessage(error) || "Произошла ошибка",
        });
      }
    },
    {
      onLoadStart: () => ioc.layoutService.setAppbarLoader(true),
      onLoadEnd: () => ioc.layoutService.setAppbarLoader(false),
    }
  );

  const { execute: removeSignal } = useAsyncAction(
    async (dto: { signalId: string; comment: string }) => {
      try {
        await commitRemoveSignal(dto.signalId, dto.comment);
        await sleep(1_000);
        pickAlert({
          description: "Сигнал удален успешно!",
        }).then(onUpdate);
      } catch (error) {
        pickAlert({
          description: getErrorMessage(error) || "Произошла ошибка",
        });
      }
    },
    {
      onLoadStart: () => ioc.layoutService.setAppbarLoader(true),
      onLoadEnd: () => ioc.layoutService.setAppbarLoader(false),
    }
  );

  const handleCloseSignal = async () => {
    const { id: signalId } = selectedRow$.current;
    const data = await pickCloseOne().toPromise();
    if (!data) {
      return;
    }
    if (data.password !== ADMIN_PASS) {
      await sleep(1_000);
      pickAlert({
        description: "Неверный пароль",
      });
      return;
    }
    await closeSignal({
      comment: data.comment,
      signalId,
    });
  };

  const handleRemoveSignal = async () => {
    const { id: signalId } = selectedRow$.current;
    const data = await pickRemoveOne().toPromise();
    if (!data) {
      return;
    }
    if (data.password !== ADMIN_PASS) {
      await sleep(1_000);
      pickAlert({
        description: "Неверный пароль",
      });
      return;
    }
    await removeSignal({
      comment: data.comment,
      signalId,
    });
  };

  const { pickData, setOpen, render } = useActionModal({
    title: "Информация",
    AfterTitle: ({ onClose }) => (
      <Stack direction="row" gap={2}>
        <IconButton
          size="small"
          onClick={() => {
            onClose();
            handleRemoveSignal();
          }}
        >
          <Delete />
        </IconButton>
        <IconButton size="small" onClick={onClose}>
          <Close />
        </IconButton>
      </Stack>
    ),
    payload: () => ({
      handleCloseSignal() {
        setOpen(false);
        handleCloseSignal();
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
