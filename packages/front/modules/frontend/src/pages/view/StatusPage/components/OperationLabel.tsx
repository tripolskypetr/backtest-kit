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
  ttl,
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
            Open Position
          </ActionButton>
          <ActionButton
            startIcon={<TrendingUpOutlined />}
            onClick={async () =>
              await commitAverageBuyEmitter.next()
            }
            color="warning"
            sx={{ whiteSpace: "nowrap" }}
          >
            Commit Averaging
          </ActionButton>
          <ActionButton
            startIcon={<ShieldOutlined />}
            onClick={async () =>
              await commitBreakevenEmitter.next()
            }
            sx={{ whiteSpace: "nowrap" }}
          >
            Commit Breakeven
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
                  Avg price {payload.symbol}:{typo.nbsp}
                  <b>{`${priceNum.toFixed(getPriceScale(priceNum))}$`}</b>
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
            Close Position
          </ActionButton>
        </Stack>
      </ScrollView>
    </Box>
  );
};

export default OperationLabel;
