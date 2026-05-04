import { Refresh } from "@mui/icons-material";
import { alpha } from "@mui/material";
import {
  TypedField,
  FieldType,
  useForceUpdate,
  ActionButton,
} from "react-declarative";

interface IFeatureParams {
  title: string;
  description: string;
  name: string;
  idx: number;
}

interface IOffsetParams {
  title: string;
  name: string;
  idx: number;
  fetchFunction: () => Promise<string[]>;
}

const createItemListFromArray = (array: string[]): Record<string, string> => {
  const result: Record<string, string> = {};
  array.forEach((item, index) => {
    result[String(index)] = item;
  });
  return result;
};

const renderFeature = ({
  title,
  description,
  name,
  idx,
}: IFeatureParams): TypedField => ({
  type: FieldType.Box,
  sx: {
    display: "grid",
    alignItems: "center",
    gridTemplateColumns: "1fr auto",
    paddingLeft: "16px",
    paddingRight: "16px",
    paddingTop: "4px",
    paddingBottom: "4px",
    background: (theme) =>
      idx % 2 === 0
        ? alpha(
            theme.palette.getContrastText(theme.palette.background.paper),
            0.04
          )
        : "transparent",
  },
  fields: [
    {
      type: FieldType.Box,
      fields: [
        {
          type: FieldType.Typography,
          fieldBottomMargin: "0",
          typoVariant: "body1",
          placeholder: title,
        },
        {
          type: FieldType.Typography,
          fieldBottomMargin: "0",
          style: {
            opacity: 0.5,
          },
          typoVariant: "caption",
          placeholder: description,
        },
      ],
    },
    {
      type: FieldType.Checkbox,
      readonly: true,
      fieldBottomMargin: "0",
      fieldRightMargin: "0",
      title: "",
      name,
    },
  ],
});

const renderPicker = ({
  title,
  name,
  idx,
  fetchFunction,
}: IOffsetParams): TypedField => ({
  type: FieldType.Box,
  sx: {
    display: "grid",
    gridTemplateColumns: "auto 1fr 125px",
    alignItems: "center",
    background: (theme) =>
      idx % 2 === 0
        ? alpha(
            theme.palette.getContrastText(theme.palette.background.paper),
            0.04
          )
        : "transparent",
    padding: "8px",
    paddingLeft: "16px",
    paddingRight: "8px",
  },
  fields: [
    {
      type: FieldType.Typography,
      typoVariant: "body1",
      fieldBottomMargin: "0",
      placeholder: title,
    },
    {
      type: FieldType.Div,
    },
    {
      type: FieldType.Combo,
      readonly: true,
      noDeselect: true,
      outlined: idx % 2 === 0,
      name,
      title: "",
      fieldBottomMargin: "0",
      itemList: async () => {
        try {
          const data = await fetchFunction();
          const itemList = createItemListFromArray(data);
          return Object.keys(itemList);
        } catch (error) {
          console.error(`Error fetching ${name} list:`, error);
          return [];
        }
      },
      tr: async (value) => {
        try {
          const data = await fetchFunction();
          const itemList = createItemListFromArray(data);
          return itemList[value] || "";
        } catch (error) {
          console.error(`Error fetching ${name} translation:`, error);
          return "";
        }
      },
    },
  ],
});

const feature_list = [
  {
    title: "JSONL Файлы",
    description:
      "Файлы, обрабатываемые Claude Code, HuggingFace, Parquet",
    name: "recent_enabled",
  },
  {
    title: "Markdown Файлы",
    description:
      "Человекочитаемые файлы. Удобно, если планируется запуск без GUI",
    name: "markdown_enabled",
  },
  {
    title: "Дамп Файлы",
    description:
      "Дамп переписки с ИИ агентом, используемым для торговых сигналов",
    name: "dump_enabled",
  },
];

export const setup_fields: TypedField[] = [
  {
    type: FieldType.Group,
    fieldRightMargin: "1",
    phoneColumns: "12",
    tabletColumns: "12",
    desktopColumns: "6",
    fields: [

      {
        type: FieldType.Paper,
        fieldBottomMargin: "1",
        fields: [
          {
            type: FieldType.Typography,
            fieldBottomMargin: "1",
            typoVariant: "h6",
            placeholder: "Режим работы",
          },
          {
            type: FieldType.Typography,
            fieldBottomMargin: "1",
            isVisible: ({ running_mode }) =>
              running_mode === "backtest",
            style: {
              color: "orange",
            },
            typoVariant: "body1",
            placeholder:
              "Обработка исторических данных",
          },
          {
            type: FieldType.Typography,
            fieldBottomMargin: "1",
            isVisible: ({ running_mode }) =>
              running_mode === "live",
            style: {
              color: "green",
            },
            typoVariant: "body1",
            placeholder:
              "Интеграция с биржей в реальном времени",
          },
          {
            type: FieldType.Typography,
            fieldBottomMargin: "1",
            isVisible: ({ running_mode }) =>
              running_mode === "none",
            style: {
              color: "red",
            },
            typoVariant: "body1",
            placeholder: "Только пользовательский интерфейс",
          },
          {
            type: FieldType.Radio,
            readonly: true,
            fieldBottomMargin: "0",
            name: "running_mode",
            radioValue: "backtest",
            title: "Исторические данные",
          },
          {
            type: FieldType.Radio,
            readonly: true,
            fieldBottomMargin: "0",
            name: "running_mode",
            radioValue: "live",
            title: "В реальном времени",
          },
          {
            type: FieldType.Radio,
            readonly: true,
            fieldBottomMargin: "0",
            name: "running_mode",
            radioValue: "none",
            title: "Только фронтенд",
          },
        ],
      },
      {
        type: FieldType.Paper,
        fieldBottomMargin: "1",
        innerPadding: "0px",
        fields: [
          {
            type: FieldType.Box,
            sx: {
              paddingTop: "16px",
              paddingLeft: "16px",
              paddingRight: "16px",
            },
            fields: [
              {
                type: FieldType.Typography,
                fieldBottomMargin: "1",
                typoVariant: "h6",
                placeholder: "Режим логов",
              },
              {
                type: FieldType.Typography,
                fieldBottomMargin: "2",
                style: {
                  opacity: 0.5,
                },
                typoVariant: "caption",
                placeholder: "Логи занимают место на жестком диске, но нужны для отладки",
              },
            ],
          },
          ...feature_list.map(({ name, title, description }, idx) =>
            renderFeature({
              name,
              title,
              description,
              idx,
            })
          ),
        ],
      },
      {
        type: FieldType.Paper,
        fieldBottomMargin: "1",
        fields: [
          {
            type: FieldType.Typography,
            fieldBottomMargin: "1",
            typoVariant: "h6",
            placeholder: "Пользовательский интерфейс",
          },
          {
            type: FieldType.Switch,
            readonly: true,
            fieldBottomMargin: "0",
            title: "Сохранять уведомления",
            name: "notification_enabled",
          },
          {
            type: FieldType.Typography,
            fieldBottomMargin: "1",
            style: {
              opacity: 0.5,
            },
            typoVariant: "caption",
            placeholder: "История событий записывается на жесткий диск",
          },
          {
            type: FieldType.Switch,
            readonly: true,
            fieldBottomMargin: "0",
            title: "Сохранять сигналы",
            name: "storage_enabled",
          },
          {
            type: FieldType.Typography,
            fieldBottomMargin: "0",
            style: {
              opacity: 0.5,
            },
            typoVariant: "caption",
            placeholder: "Последнее состояние сигнала записывается на жесткий диск",
          },
        ],
      },
    ],
  },
  {
    type: FieldType.Group,
    fieldRightMargin: "1",
    fieldBottomMargin: "2",
    phoneColumns: "12",
    tabletColumns: "12",
    desktopColumns: "6",
    fields: [
      {
        type: FieldType.Paper,
        fieldBottomMargin: "1",
        fields: [
          {
            type: FieldType.Typography,
            fieldBottomMargin: "3",
            typoVariant: "h6",
            placeholder: "Стратегия",
          },

          {
            type: FieldType.Typography,
            placeholder: "Брокер",
          },
          {
            type: FieldType.Outline,
            fieldBottomMargin: "3",
            fields: [
              {
                type: FieldType.Checkbox,
                readonly: true,
                fieldBottomMargin: "0",
                title: "Подключен в mainnet (production)",
                name: "broker_enabled",
              },
            ],
          },
          {
            type: FieldType.Typography,
            placeholder: "Сигналы рынка",
          },
          {
            type: FieldType.Outline,
            fieldBottomMargin: "4",
            fields: [
              {
                type: FieldType.Checkbox,
                readonly: true,
                fieldBottomMargin: "0",
                title: "Использовать BM25 для RAG",
                name: "memory_enabled",
              },
              {
                type: FieldType.Checkbox,
                readonly: true,
                fieldBottomMargin: "0",
                title: "Использовать Statefull стратегии",
                name: "state_enabled",
              },
              {
                type: FieldType.Checkbox,
                readonly: true,
                fieldBottomMargin: "0",
                title: "Сохранять предидущий сигнал",
                name: "recent_enabled",
              },
            ],
          },
        ],
      },
      {
        type: FieldType.Paper,
        fieldBottomMargin: "1",
        fields: [
          {
            type: FieldType.Typography,
            fieldBottomMargin: "2",
            typoVariant: "h6",
            placeholder: "Управление рисками",
          },
          {
            type: FieldType.Typography,
            fieldBottomMargin: "3",
            style: {
              opacity: 0.5,
            },
            typoVariant: "body1",
            placeholder:
              "Использовать LONG или SHORT позиции зависимо от режима рынка",
          },
          {
            type: FieldType.Checkbox,
            readonly: true,
            fieldBottomMargin: "0",
            title: "Включить LONG",
            name: "enable_long",
          },
          {
            type: FieldType.Checkbox,
            readonly: true,
            fieldBottomMargin: "1",
            title: "Включить SHORT",
            name: "enable_short",
          },
        ],
      },
    ],
  },
  {
    type: FieldType.Component,
    desktopHidden: true,
    fieldBottomMargin: "5",
    fieldRightMargin: "1",
    element: ({ payload }) => {
      const update = useForceUpdate();
      return (
        <ActionButton
          variant="contained"
          size="large"
          startIcon={<Refresh />}
          onClick={async () => {
            await payload.handleReload();
            update();
          }}
        >
          Refresh
        </ActionButton>
      );
    },
  },
];
