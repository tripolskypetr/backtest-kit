import {
  TypedField,
  FieldType,
  useAsyncValue,
  openBlank,
  Breadcrumbs2Type,
  IBreadcrumbs2Option,
  Breadcrumbs2,
  IBreadcrumbs2Action,
  Subject,
  useOnce,
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
import { KeyboardArrowLeft, Telegram, GitHub, PictureAsPdfOutlined, Refresh, PictureAsPdf, Description, DataObject } from "@mui/icons-material";
import ioc from "../../../lib";
import IconWrapper from "../../../components/common/IconWrapper";
import downloadMarkdown from "../../../utils/downloadMarkdown";

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
  {
      type: Breadcrumbs2Type.Button,
      action: "download-pdf",
      label: "Download PDF",
      icon: PictureAsPdfOutlined,
  },
];

const actions: IBreadcrumbs2Action[] = [
    {
        action: "download-json",
        label: "Download JSON",
        icon: () => <IconWrapper icon={DataObject} color="#4caf50" />,
    },
    {
        action: "download-markdown",
        label: "Download Markdown",
        icon: () => <IconWrapper icon={Description} color="#4caf50" />,
    },
    {
        action: "download-pdf",
        label: "Download PDF",
        icon: () => <IconWrapper icon={PictureAsPdf} color="#4caf50" />,
    },
    {
        divider: true,
    },
    {
        action: "update-now",
        label: "Refresh",
        icon: () => <IconWrapper icon={Refresh} color="#4caf50" />,
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
          return Number(value).toFixed(2);
        }
        if (name === "totalDuration") {
          return `${Number(value).toFixed(2)} мс`;
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

const fields: TypedField[] = [
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

const reloadSubject = new Subject<void>();


const handleDownloadMarkdown = async () => {
    const content = await ioc.performanceViewService.getPerformanceReport();
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    ioc.layoutService.downloadFile(url, `performance_${Date.now()}.md`);
};

const handleDownloadPdf = async () => {
    const content = await ioc.performanceViewService.getPerformanceReport();
    await downloadMarkdown(content);
};

const handleDownloadJson = async () => {
    const data = await ioc.performanceViewService.getPerformanceData();
    const content = JSON.stringify(data, null, 2);
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    ioc.layoutService.downloadFile(url, `performance_${Date.now()}.md`);
}

const handleReload = async () => {
  {
    ioc.performanceViewService.getPerformanceData.clear();
    ioc.performanceViewService.getPerformanceReport.clear();
    ioc.environmentViewService.getEnvironmentData.clear();
  }
  await reloadSubject.next();
};

export const DashboardView = () => {

  const [data, { execute: executeData, loading: loadingData }] = useAsyncValue(
    async () => {
      const data = await ioc.performanceViewService.getPerformanceData();
      return data;
    },
    {
      onLoadStart: () => ioc.layoutService.setAppbarLoader(true),
      onLoadEnd: () => ioc.layoutService.setAppbarLoader(false),
    }
  );

  useOnce(() => reloadSubject.subscribe(executeData));

  const handleAction = async (action: string) => {
    if (action === "back-action") {
      ioc.routerService.push("/main")
    }
    if (action === "update-now") {
      await handleReload();
    }
    if (action === "download-markdown") {
        await handleDownloadMarkdown();
    }
    if (action === "download-pdf") {
        await handleDownloadPdf();
    }
    if (action === "download-json") {
        await handleDownloadJson();
    }
  };

  const [env, { execute: executeEnv, loading: loadingEnv }] = useAsyncValue(async () => {
    const data = await ioc.environmentViewService.getEnvironmentData();
    return data;
  });

  useOnce(() => reloadSubject.subscribe(executeEnv));

  if (!data || !env) {
    return null;
  }

  if (loadingData || loadingEnv) {
    return null;
  }

  return (
    <Container>
      <Breadcrumbs2 items={options} actions={actions} onAction={handleAction} />
      <One 
        handler={() => {
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
        }} 
        fields={fields}
      />
    </Container>
  );
};

export default DashboardView;
