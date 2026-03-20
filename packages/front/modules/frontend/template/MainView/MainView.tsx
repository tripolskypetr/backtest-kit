import {
  TypedField,
  FieldType,
  useAsyncValue,
  openBlank,
  Breadcrumbs2Type,
  IBreadcrumbs2Option,
  Breadcrumbs2,
  IBreadcrumbs2Action,
  LoaderView,
  One,
  ScrollView,
  useOne,
  useAlert,
  sleep,
  useAsyncAction,
  getErrorMessage,
  formatAmount,
  useActualRef,
  useOnce,
  useConfirm,
  wordForm,
} from "react-declarative";

import { Container } from "@mui/material";
import { KeyboardArrowLeft, Refresh } from "@mui/icons-material";
import Currency from "./components/Currency";
import IconWrapper from "../../components/common/IconWrapper";
import { reloadSubject } from "../../config/emitters";
import { fetchModerateList } from "./api/fetchModerateList";
import { fetchModerateAccept } from "./api/fetchModerateAccept";
import { fetchModerateDecline } from "./api/fetchModerateDecline";
import { ConfirmModel } from "./model/Confirm.model";
import { fetchSymbolMap } from "./api/fetchSymbolMap";
import { defaultSlots } from "../../components/OneSlotFactory";
import { useLoader } from "../../components/LoaderProvider";

const ADMIN_PASS = "88888888";

const options: IBreadcrumbs2Option[] = [
  {
    type: Breadcrumbs2Type.Link,
    action: "back-action",
    label: <KeyboardArrowLeft sx={{ display: "block" }} />,
  },
  {
    type: Breadcrumbs2Type.Link,
    action: "back-action",
    label: "Дэшборд",
  },
  {
    type: Breadcrumbs2Type.Link,
    action: "back-action",
    label: "Меню",
  },
];

const accept_fields: TypedField[] = [
  {
    type: FieldType.Text,
    fieldBottomMargin: "3",
    fieldRightMargin: "0",
    autoFocus: true,
    dirty: true,
    validation: {
      required: true,
    },
    name: "password",
    inputType: "password",
    title: "Пароль администратора",
  },
  {
    type: FieldType.Typography,
    typoVariant: "body1",
    placeholder: "Предпросмотр",
  },
  {
    type: FieldType.Outline,
    fieldBottomMargin: "2",
    fields: [
      {
        type: FieldType.Text,
        outlined: true,
        name: "symbol",
        title: "Монета",
        compute: (obj) => obj.displayName || obj.symbol,
        readonly: true,
      },
      {
        type: FieldType.Text,
        outlined: true,
        name: "position",
        title: "Позиция",
        readonly: true,
        compute: (obj) => {
          const isLong = obj.position === "long";
          return isLong ? "🔵 LONG" : "🟠 SHORT";
        },
      },
      {
        type: FieldType.Text,
        columns: "6",
        outlined: true,
        name: "takeProfitPrice",
        title: "Take Profit",
        readonly: true,
        compute: (obj) =>
          obj.takeProfitPrice ? `${formatAmount(obj.takeProfitPrice)}$` : "N/A",
      },
      {
        type: FieldType.Text,
        columns: "6",
        outlined: true,
        name: "stopLossPrice",
        title: "Stop Loss",
        readonly: true,
        compute: (obj) =>
          obj.stopLossPrice ? `${formatAmount(obj.stopLossPrice)}$` : "N/A",
      },
      {
        type: FieldType.Text,
        outlined: true,
        name: "estimatedMinutes",
        title: "ETA до TP",
        readonly: true,
        compute: (obj) =>
          obj.estimatedMinutes
            ? `~${wordForm(obj.estimatedMinutes, { one: "минута", two: "минуты", many: "минут" })}`
            : "N/A",
      },
    ],
  },
  {
    type: FieldType.Text,
    fieldBottomMargin: "0",
    fieldRightMargin: "0",
    dirty: true,
    validation: {
      required: true,
    },
    name: "comment",
    title: "Комментарий",
    inputRows: 4,
    placeholder: "Введите комментарий о подтверждении сигнала...",
  },
];

const decline_fields: TypedField[] = [
  {
    type: FieldType.Text,
    fieldBottomMargin: "3",
    fieldRightMargin: "0",
    autoFocus: true,
    dirty: true,
    validation: {
      required: true,
    },
    name: "password",
    inputType: "password",
    title: "Пароль администратора",
  },
  {
    type: FieldType.Typography,
    typoVariant: "body1",
    placeholder: "Предпросмотр",
  },
  {
    type: FieldType.Outline,
    fieldBottomMargin: "2",
    fields: [
      {
        type: FieldType.Text,
        outlined: true,
        name: "symbol",
        title: "Монета",
        compute: (obj) => obj.displayName || obj.symbol,
        readonly: true,
      },
      {
        type: FieldType.Text,
        outlined: true,
        name: "position",
        title: "Позиция",
        readonly: true,
        compute: (obj) => {
          const isLong = obj.position === "long";
          return isLong ? "🔵 LONG" : "🟠 SHORT";
        },
      },
      {
        type: FieldType.Text,
        columns: "6",
        outlined: true,
        name: "takeProfitPrice",
        title: "Take Profit",
        readonly: true,
        compute: (obj) =>
          obj.takeProfitPrice ? `${formatAmount(obj.takeProfitPrice)}$` : "N/A",
      },
      {
        type: FieldType.Text,
        columns: "6",
        outlined: true,
        name: "stopLossPrice",
        title: "Stop Loss",
        readonly: true,
        compute: (obj) =>
          obj.stopLossPrice ? `${formatAmount(obj.stopLossPrice)}$` : "N/A",
      },
      {
        type: FieldType.Text,
        outlined: true,
        name: "estimatedMinutes",
        title: "ETA до TP",
        readonly: true,
        compute: (obj) =>
          obj.estimatedMinutes
            ? `~${wordForm(obj.estimatedMinutes, { one: "минута", two: "минуты", many: "минут" })}`
            : "N/A",
      },
    ],
  },
  {
    type: FieldType.Text,
    fieldBottomMargin: "0",
    fieldRightMargin: "0",
    dirty: true,
    validation: {
      required: true,
    },
    name: "comment",
    title: "Причина отклонения",
    inputRows: 4,
    placeholder: "Введите причину отклонения сигнала...",
  },
];

const createFields = async (): Promise<TypedField[]> => {
  const moderates = await fetchModerateList();

  /*
  [
    {
      symbol: "BTCUSDT",
      takeProfitPrice: 69500,
      stopLossPrice: 66000,
      currentPrice: 67850,
      comment: "Long entry based on breakout from resistance zone.",
      info: "4H timeframe | Trend continuation setup | Volume increasing",
      date: new Date().toISOString(),
      displayName: "Bitcoin",
    },
  ];
  */

  if (!moderates || moderates.length === 0) {
    return [
      {
        type: FieldType.Typography,
        typoVariant: "h6",
        placeholder: "Нет сигналов для подтверждения",
        sx: { textAlign: "center", opacity: 0.5, mt: 4 },
      },
    ];
  }

  const symbolMap = await fetchSymbolMap();

  const fields = moderates.map((moderate: ConfirmModel): TypedField => {
    const symbolData = symbolMap[moderate.symbol];
    const displayName = symbolData?.displayName || moderate.symbol;

    return {
      type: FieldType.Group,
      desktopColumns: "4",
      tabletColumns: "6",
      phoneColumns: "12",
      fieldRightMargin: "1",
      fieldBottomMargin: "1",
      child: {
        type: FieldType.Component,
        element: ({ payload }) => (
          <Currency
            symbol={moderate.symbol}
            displayName={displayName}
            position={moderate.position}
            takeProfitPrice={moderate.takeProfitPrice}
            stopLossPrice={moderate.stopLossPrice}
            currentPrice={moderate.currentPrice}
            comment={moderate.comment}
            info={moderate.info}
            date={moderate.date}
            estimatedMinutes={moderate.estimatedMinutes}
            onConfirm={payload.handleConfirm}
            onReject={payload.handleReject}
          />
        ),
      },
    };
  });

  if (fields.length > 2) {
    return fields;
  }

  return [
    {
      type: FieldType.Center,
      sx: (theme) => ({
        [theme.breakpoints.up("lg")]: {
          height: "calc(100dvh - 116px)",
          transform: "translateY(-56px)",
        },
      }),
      fields,
    },
  ];
};

const actions: IBreadcrumbs2Action[] = [
  {
    action: "update-now",
    label: "Обновить",
    icon: () => <IconWrapper icon={Refresh} color="#4caf50" />,
  },
];

export const DashboardView = () => {
  const [, setLoader] = useLoader();

  const pickConfirm = useConfirm({
    title: "Вы уверены?",
    msg: "Вы уверены, что хотите подтвердить торговый сигнал?",
    canCancel: true,
  });

  const pickAlert = useAlert({
    title: "Статус",
    large: true,
  });

  const pickAcceptOne = useOne({
    title: "Подтверждение сигнала",
    fields: accept_fields,
    slots: defaultSlots,
    large: true,
  });

  const pickDeclineOne = useOne({
    title: "Отклонение сигнала",
    fields: decline_fields,
    slots: defaultSlots,
    large: true,
  });

  const { execute: acceptSignal } = useAsyncAction(
    async (dto: { symbol: string; comment: string }) => {
      try {
        await fetchModerateAccept(dto.symbol, dto.comment);
        await sleep(1_000);
        pickAlert({
          description: "Сигнал подтвержден успешно!",
        }).then(() => reloadSubject.next());
      } catch (error) {
        pickAlert({
          description: getErrorMessage(error) || "Произошла ошибка",
        });
      }
    },
    {
      onLoadStart: () => setLoader(true),
      onLoadEnd: () => setLoader(false),
    }
  );

  const { execute: declineSignal } = useAsyncAction(
    async (dto: { symbol: string; comment: string }) => {
      try {
        await fetchModerateDecline(dto.symbol, dto.comment);
        await sleep(1_000);
        pickAlert({
          description: "Сигнал отклонен успешно!",
        }).then(() => reloadSubject.next());
      } catch (error) {
        pickAlert({
          description: getErrorMessage(error) || "Произошла ошибка",
        });
      }
    },
    {
      onLoadStart: () => setLoader(true),
      onLoadEnd: () => setLoader(false),
    }
  );

  const handleConfirm = async (
    symbol: string,
    displayName: string,
    moderate: ConfirmModel
  ) => {
    const confirm = await pickConfirm({
      msg: `Вы уверены, что хотите подтвердить торговый сигнал?`,
    }).toPromise();
    await sleep(1_000);
    if (!confirm) {
      return;
    }
    const data = await pickAcceptOne({
      handler: () => ({
        symbol,
        displayName,
        ...moderate,
        comment: "",
      }),
    }).toPromise();
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
    await acceptSignal({
      symbol,
      comment: data.comment,
    });
  };

  const handleReject = async (
    symbol: string,
    displayName: string,
    moderate: ConfirmModel
  ) => {
    const data = await pickDeclineOne({
      handler: () => ({
        symbol,
        displayName,
        ...moderate,
        comment: "",
      }),
    }).toPromise();
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
    await declineSignal({
      symbol,
      comment: data.comment,
    });
  };

  const [fields, { loading, execute }] = useAsyncValue(
    async () => {
      return await createFields();
    },
  );

  useOnce(() => reloadSubject.subscribe(execute));

  const handleAction = async (action: string) => {
    if (action === "back-action") {
      openBlank("/");
      window.close();
    }
    if (action === "update-now") {
      await reloadSubject.next();
    }
  };

  const renderInner = () => {
    if (!fields || loading) {
      return <LoaderView sx={{ height: "calc(100dvh - 116px)" }} />;
    }
    return (
      <ScrollView sx={{ height: "calc(100dvh - 116px)" }} hideOverflowX>
        <One
          fields={fields}
          payload={() => ({
            handleConfirm,
            handleReject,
          })}
        />
      </ScrollView>
    );
  };

  return (
    <Container>
      <Breadcrumbs2 items={options} actions={actions} onAction={handleAction} />
      {renderInner()}
    </Container>
  );
};

export default DashboardView;
