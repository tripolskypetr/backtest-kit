import {
  TypedField,
  FieldType,
  useAsyncValue,
  openBlank,
  Breadcrumbs2Type,
  IBreadcrumbs2Option,
  Breadcrumbs2,
  formatAmount,
} from "react-declarative";

import {
  Avatar,
  Box,
  Button,
  Container,
  Paper,
  Typography,
  darken,
} from "@mui/material";
import { One } from "react-declarative";
import { useMemo } from "react";
import { KeyboardArrowLeft, Telegram, GitHub } from "@mui/icons-material";
import ioc from "../../../lib";

const AVATAR_SIDE = 144;
const AVATAR_SRC = "/logo/icon512_maskable.png";

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
    label: "Производительность",
  },
];

const createRateRow = ({ name, title }): TypedField => ({
  type: FieldType.Box,
  sx: {
    display: "grid",
    gridTemplateColumns: "auto 1fr auto",
    paddingBottom: "8px",
    alignItems: "center",
  },
  fields: [
    {
      type: FieldType.Typography,
      fieldBottomMargin: "0",
      typoVariant: "body1",
      placeholder: title,
    },
    {
      type: FieldType.Div,
    },
    {
      type: FieldType.Typography,
      typoVariant: "h6",
      style: {
        textAlign: "right",
        fontWeight: "bold",
      },
      fieldBottomMargin: "0",
      fieldRightMargin: "0",
      compute: ({ [name]: value }) => {
        if (!value && value !== 0) {
          return "-";
        }
        if (name === "totalEvents") {
          return formatAmount(value);
        }
        if (name === "totalDuration") {
          return `${formatAmount(value)} мс`;
        }
        if (name === "avgDuration") {
          return `${Number(value).toFixed(2)} мс`;
        }
        return value;
      },
      name,
    },
  ],
});

const createLinkRow = ({ name, title }): TypedField => ({
  type: FieldType.Box,
  sx: {
    display: "grid",
    gridTemplateColumns: "auto 1fr auto",
    paddingBottom: "8px",
    alignItems: "center",
  },
  fields: [
    {
      type: FieldType.Typography,
      fieldBottomMargin: "0",
      typoVariant: "body1",
      placeholder: title,
    },
    {
      type: FieldType.Div,
    },
    {
      type: FieldType.Component,
      style: {
        textAlign: "right",
        fontWeight: "bold",
      },
      fieldBottomMargin: "0",
      fieldRightMargin: "0",
      element: ({ [name]: value }) => {
        const isGitHub = name === "github";
        const Icon = isGitHub ? GitHub : Telegram;
        const color = isGitHub ? "#6A1B9A" : "#24A1DE";

        return (
          <Button
            size="medium"
            disabled={!value}
            startIcon={
              <Avatar sx={{ background: "#eee", height: "25px", width: "25px" }}>
                <Icon
                  sx={{
                    color: color,
                    fontSize: "16px !important",
                    transform: "translate(-0.5px, 0px)",
                  }}
                />
              </Avatar>
            }
            sx={{
              background: "white",
              color: color,
              "&:hover": { background: "white", color: color },
            }}
            onClick={() => {
              if (isGitHub) {
                openBlank(String(value));
              } else {
                const channelName = String(value).replaceAll("@", "");
                openBlank(`https://t.me/${channelName}`);
              }
            }}
          >
            {value ? "Открыть" : "Не настроен"}
          </Button>
        );
      },
      name,
    },
  ],
});

export const fields: TypedField[] = [
  {
    type: FieldType.Box,
    sx: {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      height: "80vh",
    },
    child: {
      type: FieldType.Layout,
      customLayout: ({ children }) => (
        <Paper sx={{ width: "335px" }}>{children}</Paper>
      ),
      fields: [
        {
          type: FieldType.Component,
          element: () => (
            <Box
              sx={{
                background: (theme) =>
                  darken(theme.palette.background.paper, 0.13),
                display: "flex",
                alignItems: "center",
                flexDirection: "column",
                gap: 1,
                p: 1,
              }}
            >
              <Avatar
                sx={{
                  height: AVATAR_SIDE,
                  width: AVATAR_SIDE,
                  marginTop: `${AVATAR_SIDE / 4}px`,
                  marginBottom: `${AVATAR_SIDE / 4}px`,
                }}
                src={AVATAR_SRC}
              />
              <Typography variant="subtitle2" sx={{ opacity: 0.5 }}>
                Backtest Kit
              </Typography>
            </Box>
          ),
        },
        {
          type: FieldType.Layout,
          customLayout: ({ children }) => <Box p={1}>{children}</Box>,
          fields: [
            {
              type: FieldType.Div,
              style: { height: "2px" },
            },
            {
              type: FieldType.Div,
              style: { height: "12px" },
            },
            createRateRow({
              name: "totalEvents",
              title: "Всего событий",
            }),
            createRateRow({
              name: "totalDuration",
              title: "Общее время (мс)",
            }),
            createRateRow({
              name: "avgDuration",
              title: "Среднее время (мс)",
            }),
            createLinkRow({
              name: "channel",
              title: "Канал",
            }),
            createLinkRow({
              name: "github",
              title: "GitHub",
            }),
          ],
        },
      ],
    },
  },
];

export const DashboardView = () => {

  const handleAction = async (action: string) => {
    if (action === "back-action") {
      ioc.routerService.push("/main")
    }
  };

  const [data] = useAsyncValue(
    async () => {
      const data = await ioc.performanceViewService.getPerformanceData();
      return data;
    },
    {
      onLoadStart: () => ioc.layoutService.setAppbarLoader(true),
      onLoadEnd: () => ioc.layoutService.setAppbarLoader(false),
    }
  );

  const [env] = useAsyncValue(async () => {
    const data = await ioc.environmentViewService.getEnvironmentData();
    return data;
  });

  const measures = useMemo(() => {
    if (!data || !env) {
      return null;
    }

    const avgDuration = data.totalEvents > 0
      ? data.totalDuration / data.totalEvents
      : 0;

    return {
      channel: env.telegram_channel,
      github: "https://github.com/tripolskypetr/backtest-kit",
      totalEvents: data.totalEvents,
      totalDuration: data.totalDuration,
      avgDuration: avgDuration,
    };
  }, [data, env]);

  if (!data || !env) {
    return null;
  }

  console.log({ measures });

  return (
    <Container>
      <Breadcrumbs2 items={options} onAction={handleAction} />
      <One handler={() => measures} fields={fields} />
    </Container>
  );
};

export default DashboardView;
