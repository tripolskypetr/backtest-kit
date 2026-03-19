import {
  ActionIcon,
  AutoSizer,
  fetchApi,
  LoaderView,
  randomString,
  ScrollView,
  TSubject,
  useActualValue,
  useAsyncValue,
  useOnce,
} from "react-declarative";
import { Box, Divider, IconButton, Paper, SxProps, Typography } from "@mui/material";
import { Download, Info } from "@mui/icons-material";
import downloadMarkdown from "../../utils/downloadMarkdown";
import Markdown from "../../components/common/Markdown";
import InfoButton from "../../components/common/InfoButton";
import PriceData from "./components/PriceData";
import StockChart from "./components/StockChart";
import { useState } from "react";
import AlertPicker from "../../components/AlertPicker";
import toPlainString from "../../helpers/toPlainString";

interface IReportWidgetProps {
  sx?: SxProps;
  symbol: string;
  source: string;
  reloadSubject: TSubject<void>;
  downloadSubject: TSubject<void>;
}

const titleMap = {
  "1m": "Свечи 1 минута",
  "15m": "Свечи 15 минут",
  "1h": "Свечи 1 час",
};

const colorMap = {
  "1m": "#2979ff",
  "15m": "#f3a43a",
  "1h": "#d500f9",
};

function downloadJson(
  jsonString: string,
  fileName: string = "data.json"
): void {
  // Create a Blob from the JSON string
  const blob = new Blob([jsonString], { type: "application/json" });

  // Create a temporary URL for the Blob
  const url = window.URL.createObjectURL(blob);

  // Create a temporary anchor element
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;

  // Programmatically click the link to trigger download
  document.body.appendChild(link);
  link.click();

  // Clean up
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}

const fetchPriceCandles = async (symbol: string, source: string) => {
  const { error, data } = await fetchApi(`/price_candles_${source}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      requestId: randomString(),
      serviceName: "measure-app",
      symbol: String(symbol).toUpperCase(),
      source,
    }),
  });
  if (error) {
    throw new Error(error);
  }
  return data;
};

const fetchPendingSignals = async (symbol: string) => {
  const { error, data } = await fetchApi(
    `/report/pending_signal/${String(symbol).toUpperCase()}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        requestId: randomString(),
        serviceName: "kpi-app",
      }),
    }
  );
  if (error) {
    throw new Error(error);
  }
  return data;
};

export const ReportWidget = ({
  sx,
  symbol,
  source,
  reloadSubject,
  downloadSubject,
}: IReportWidgetProps) => {
  const [alert, setAlert] = useState<{
    title: string;
    description: string;
  } | null>(null);

  const [data, { execute, loading }] = useAsyncValue(
    async () => {
      const [candles, signals] = await Promise.all([
        fetchPriceCandles(symbol, source),
        fetchPendingSignals(symbol),
      ]);
      return {
        candles,
        signals,
      };
    },
    {
      deps: [symbol, source],
    }
  );

  const data$ = useActualValue(data);

  useOnce(() => reloadSubject.subscribe(execute));

  useOnce(() =>
    downloadSubject.subscribe(() => {
      if (!data$.current) {
        return;
      }
      const { candles } = data$.current;
      downloadJson(
        JSON.stringify(candles, null, 2),
        `${symbol}-${source}.json`
      );
    })
  );

  const renderInner = () => {
    if (!data) {
      return <LoaderView sx={{ height: "100%" }} />;
    }
    if (loading) {
      return <LoaderView sx={{ height: "100%" }} />;
    }
    return (
      <Box
        sx={{
          position: "relative",
          flex: 1,
        }}
      >
        <AutoSizer style={{ position: "absolute" }} payload={data}>
          {({ height, width, payload }) => (
            <StockChart
              height={height}
              width={width}
              items={payload.candles}
              lines={payload.signals}
              source={source as "1m" | "15m" | "1h"}
            />
          )}
        </AutoSizer>
      </Box>
    );
  };

  const renderAlert = () => {
    if (!alert) {
      return null;
    }
    return (
      <AlertPicker
        description={alert.description}
        title={alert.title}
        large
        open
        onOk={() => setAlert(null)}
      />
    );
  };

  return (
    <Paper
      sx={{
        ...sx,
        display: "flex",
        alignItems: "stretch",
        justifyContent: "stretch",
        flexDirection: "column",
        background: "whitesmote",
        overflow: "hidden",
      }}
    >
      <Box
        sx={{
          background: colorMap[source] || "#ff669a",
          minHeight: "60px",
          display: "flex",
          alignItems: "center",
          pl: 1,
        }}
      >
        <Typography
          variant="h5"
          sx={{
            color: "white",
            fontWeight: "bold",
            whiteSpace: "nowrap",
            overflow: "hidden",
            maxWidth: "60vw",
            textOverflow: "ellipsis",
          }}
        >
          {titleMap[source] || source}
        </Typography>
        <Box flex={1} />
        <PriceData symbol={symbol} />
        <IconButton
          disabled={!data?.signals?.length}
          sx={{ ml: 1, mr: 1, color: "white" }}
          onClick={() =>
            setAlert({
              title: `Комментарий ${String(symbol).toUpperCase()}`,
              description: toPlainString(data.signals[0].comment),
            })
          }
        >
          <Info />
        </IconButton>
      </Box>
      <Divider />
      {renderInner()}
      {renderAlert()}
    </Paper>
  );
};

export default ReportWidget;
