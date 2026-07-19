import Stack from "@mui/material/Stack";
import Box from "@mui/material/Box";
import {
  ActionButton,
  Async,
  fetchApi,
  formatAmount,
  LoaderView,
  randomString,
  ScrollView,
  singleshot,
  sleep,
  TSubject,
  typo,
  useAsyncValue,
  useOnce,
} from "react-declarative";
import {
  AirlineStops,
  CloseOutlined,
  LightbulbOutlined,
  ShieldOutlined,
  ShowChart,
  TrendingUpOutlined,
} from "@mui/icons-material";
import {
  commitAverageBuyEmitter,
  commitBreakevenEmitter,
  commitClosePendingEmitter,
  commitOpenPendingEmitter,
} from "../config/emitters";
import { Typography } from "@mui/material";
import ioc from "../../../../lib";
import { reloadSubject } from "../../../../config/emitters";
import getPriceScale from "../../../../utils/getPriceScale";
import { t } from "../../../../i18n";
import PauseButton from "./PauseButton";

interface IOperationLabelProps {
  payload: {
    symbol: string;
    strategyName: string;
    exchangeName: string;
  };
}
const Loader = LoaderView.createLoader(12);

export const OperationLabel = ({ payload }: IOperationLabelProps) => {
  return (
    <Box
      sx={{
        mb: 1,
        minHeight: 48,
      }}
    >
      <ScrollView
        sx={{
          height: "100%",
          minHeight: 48,
        }}
        hideOverflowY
      >
        <Stack direction="row" gap={1} sx={{ pointerEvents: "all" }}>
          <ActionButton
            startIcon={<AirlineStops />}
            onClick={async () =>
              await commitOpenPendingEmitter.next()
            }
            color="success"
            sx={{ whiteSpace: "nowrap" }}
          >
            {t("Open Position")}
          </ActionButton>
          <ActionButton
            startIcon={<TrendingUpOutlined />}
            onClick={async () =>
              await commitAverageBuyEmitter.next()
            }
            color="warning"
            sx={{ whiteSpace: "nowrap" }}
          >
            {t("Commit Averaging")}
          </ActionButton>
          <ActionButton
            startIcon={<ShieldOutlined />}
            onClick={async () =>
              await commitBreakevenEmitter.next()
            }
            sx={{ whiteSpace: "nowrap" }}
          >
            {t("Commit Breakeven")}
          </ActionButton>
          <Box flex={1} />
          <Async
            Loader={Loader}
            deps={[
              payload.symbol,
              payload.exchangeName,
              payload.strategyName,
            ]}
            reloadSubject={reloadSubject}
          >
            {async () => {
              const price =
                await ioc.controlViewService.getAveragePrice(
                  payload.symbol,
                  {
                    exchangeName: payload.exchangeName,
                    strategyName: payload.strategyName,
                  },
                );
              const priceNum = Number(price);
              return (
                <Typography
                  height="100%"
                  display="flex"
                  alignItems="center"
                  whiteSpace="nowrap"
                  mr={1}
                >
                  {t("Avg price")} {payload.symbol}:{typo.nbsp}
                  <b>{`${priceNum.toFixed(getPriceScale(priceNum))}${t("$")}`}</b>
                </Typography>
              );
            }}
          </Async>
          <ActionButton
            startIcon={<CloseOutlined />}
            onClick={async () =>
              await commitClosePendingEmitter.next()
            }
            sx={{ whiteSpace: "nowrap" }}
            color="error"
          >
            {t("Close Position")}
          </ActionButton>
          <PauseButton payload={payload} />
        </Stack>
      </ScrollView>
    </Box>
  );
};

export default OperationLabel;
