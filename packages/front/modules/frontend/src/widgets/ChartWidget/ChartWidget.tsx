import {
  AutoSizer,
  fetchApi,
  LoaderView,
  randomString,
  TSubject,
  useActualValue,
  useAsyncValue,
  useOnce,
} from "react-declarative";
import { Box, SxProps } from "@mui/material";
import StockChart from "./components/StockChart";

interface IReportWidgetProps {
  sx?: SxProps;
  symbol: string;
  source: string;
  reloadSubject: TSubject<void>;
  downloadSubject: TSubject<void>;
}

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

  return (
    <Box
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
      {renderInner()}
    </Box>
  );
};

export default ReportWidget;
