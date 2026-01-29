import { Delete } from "@mui/icons-material";
import {
  Box,
  List,
  ListItemButton,
  ListItemText,
  Paper,
    darken,
  lighten,
  Typography,
  ListSubheader,
  ListItem,
  alpha,
  getContrastRatio,
} from "@mui/material";
import {
  Async,
  formatAmount,
  ITabsOutletProps,
  useAsyncValue,
  useElementSize,
} from "react-declarative";
import React from "react";
import ioc from "../../../../lib";
import IconPhoto from "../../../../components/common/IconPhoto";
import { IStorageSignalRow } from "backtest-kit";

interface IListViewData {
  type: "backtest" | "live";
}

function isLightColor(hex: string) {
  // Compare contrast with black (#000000) and white (#FFFFFF)
  const contrastWithBlack = getContrastRatio(hex, "#000000");
  const contrastWithWhite = getContrastRatio(hex, "#FFFFFF");

  // If contrast with black is higher, the color is likely light
  return contrastWithBlack > contrastWithWhite;
}

const IconWrapper = ({ icon: Icon, color }: { icon: React.ElementType; color: string }) => (
  <Box
    sx={{
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      p: 1,
    }}
  >
    <Icon sx={{ color }} />
  </Box>
);

const formatTimeElapsed = (timestamp: number): string => {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}д назад`;
  if (hours > 0) return `${hours}ч назад`;
  if (minutes > 0) return `${minutes}м назад`;
  return "только что";
};

export const ListView = ({
  data: { type },
  setLoading,
}: ITabsOutletProps<IListViewData>) => {
  const { elementRef, size } = useElementSize<HTMLUListElement>({
    closest: ".MuiContainer-root",
    compute: (size) => {
      size.height -= 150;
      return size;
    },
  });

  const [signals, { loading, execute }] = useAsyncValue(
    async () => {
      if (type === "live") {
        return await ioc.storageViewService.listSignalLive();
      }
      return await ioc.storageViewService.listSignalBacktest();
    },
    {
      onLoadStart: () => setLoading(true),
      onLoadEnd: () => setLoading(false),
      deps: [type],
    }
  );

  const signalsBySymbol = React.useMemo(() => {
    if (!signals) return {};
    return signals.reduce(
      (acc, signal) => {
        if (!acc[signal.symbol]) {
          acc[signal.symbol] = [];
        }
        acc[signal.symbol].push(signal);
        return acc;
      },
      {} as Record<string, IStorageSignalRow[]>
    );
  }, [signals]);

  const renderGroup = (symbol: string) => {
    const items = signalsBySymbol[symbol] || [];

    if (!items.length) {
      return (
        <ListItem>
          <ListItemText
            sx={{
              "& .MuiTypography-body2": {
                maxWidth: "435px",
              },
            }}
            primary="Нет сигналов"
            secondary="Сигналы будут отображены здесь после появления"
          />
        </ListItem>
      );
    }

    return (
      <>
        {items.map((item, idx) => (
          <ListItemButton
            sx={{
              background: (theme) =>
                idx % 2 === 1
                  ? alpha(
                      theme.palette.getContrastText(
                        theme.palette.background.paper
                      ),
                      0.02
                    )
                  : undefined,
            }}
            key={`item-${symbol}-${item.id}`}
          >
            <ListItemText
              primary={
                <Box
                  sx={{
                    display: "flex",
                    gap: 2,
                    flexWrap: "wrap",
                    alignItems: "center",
                  }}
                >
                  <Typography
                    variant="body2"
                    component="span"
                    sx={{
                      fontWeight: "bold",
                      px: 1,
                      py: 0.5,
                      borderRadius: 1,
                      background:
                        item.position === "long" ? "#1976D2" : "#F57C00",
                      color: "white",
                    }}
                  >
                    {item.position === "long" ? "LONG" : "SHORT"}
                  </Typography>
                  <Typography
                    variant="body2"
                    component="span"
                    sx={{ fontWeight: "medium" }}
                  >
                    <Box
                      component="span"
                      sx={{
                        color: "text.secondary",
                        mr: 0.5,
                      }}
                    >
                      Entry:
                    </Box>
                    {formatAmount(item.priceOpen)}$
                  </Typography>
                  <Typography
                    variant="body2"
                    component="span"
                    sx={{
                      fontWeight: "medium",
                      color: "success.main",
                    }}
                  >
                    <Box
                      component="span"
                      sx={{
                        color: "text.secondary",
                        mr: 0.5,
                      }}
                    >
                      TP:
                    </Box>
                    {formatAmount(item.priceTakeProfit)}$
                  </Typography>
                  <Typography
                    variant="body2"
                    component="span"
                    sx={{
                      fontWeight: "medium",
                      color: "error.main",
                    }}
                  >
                    <Box
                      component="span"
                      sx={{
                        color: "text.secondary",
                        mr: 0.5,
                      }}
                    >
                      SL:
                    </Box>
                    {formatAmount(item.priceStopLoss)}$
                  </Typography>
                  <Typography
                    variant="caption"
                    component="span"
                    sx={{
                      px: 1,
                      py: 0.25,
                      borderRadius: 0.5,
                      background:
                        item.status === "opened"
                          ? alpha("#4caf50", 0.2)
                          : item.status === "scheduled"
                            ? alpha("#ff9800", 0.2)
                            : item.status === "closed"
                              ? alpha("#9e9e9e", 0.2)
                              : alpha("#f44336", 0.2),
                      color:
                        item.status === "opened"
                          ? "#2e7d32"
                          : item.status === "scheduled"
                            ? "#e65100"
                            : item.status === "closed"
                              ? "#616161"
                              : "#c62828",
                    }}
                  >
                    {item.status}
                  </Typography>
                </Box>
              }
              secondary={formatTimeElapsed(item.createdAt)}
            />
            <IconWrapper icon={Delete} color="#ff3d00" />
          </ListItemButton>
        ))}
      </>
    );
  };

  return (
    <List
      ref={elementRef}
      sx={{
        width: "100%",
        maxHeight: size.height,
        overflowX: "hidden",
        overflowY: "auto",
        scrollbarWidth: "thin",
        bgcolor: "background.paper",
        position: "relative",
        "& ul": { padding: 0 },
      }}
      subheader={<li />}
    >
      <Async deps={[signalsBySymbol]}>
        {async () => {
          const symbolList = Object.keys(signalsBySymbol);
          const symbolMap = await ioc.symbolGlobalService.getSymbolMap();

          if (!symbolList.length) {
            return (
              <ListItem>
                <ListItemText
                  primary="Нет сигналов"
                  secondary={
                    type === "live"
                      ? "Live сигналы будут отображены здесь"
                      : "Backtest сигналы будут отображены здесь"
                  }
                />
              </ListItem>
            );
          }

          return symbolList.map((symbol) => {
            const color = symbolMap[symbol]?.color;
            return (
                          <li key={`section-${symbol}`}>
              <ul>
                <ListSubheader
                  sx={{
                    background: isLightColor(color) ? darken(color, 0.1) : lighten(color, 0.1),
                    color: isLightColor(color) ? "white !important" : "black !important",
                    zIndex: 9,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <Box
                    sx={{
                      position: "relative",
                      paddingRight: "8px",
                    }}
                  >
                    <IconPhoto symbol={symbol} />
                  </Box>
                  {symbolMap[symbol]?.displayName || symbol}
                  <Box flex={1} />
                  <Typography variant="body2" sx={{ fontWeight: "medium" }}>
                    {signalsBySymbol[symbol]?.length || 0} сигнал(ов)
                  </Typography>
                </ListSubheader>
                <Box
                  sx={{
                    marginTop: "16px",
                    marginBottom: "16px",
                  }}
                >
                  {renderGroup(symbol)}
                </Box>
              </ul>
            </li>
            );
          });
        }}
      </Async>
    </List>
  );
};

export default ListView;
