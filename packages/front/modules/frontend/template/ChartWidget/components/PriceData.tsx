import { useState, useEffect } from "react";
import { Typography } from "@mui/material";
import { formatAmount, memoize, Source } from "react-declarative";

const createWebSocketURL = (path: string) => {
  if (!path.startsWith("/")) {
    throw new Error('Path must start with a "/"');
  }

  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const url = new URL(path, window.location.origin);
  url.protocol = protocol;
  return url;
};

interface IPriceDataProps {
  symbol: string;
}

const createEmitter = memoize(
  ([symbol]) => `${symbol}`,
  (symbol: string) =>
    Source.multicast(() =>
      Source.createCold((next) => {
        console.log(`Candlesticks socket opened symbol=${symbol}`);
        const websocket = new WebSocket(
          createWebSocketURL(`/candlesticks/${String(symbol).toUpperCase()}`)
        );

        websocket.onopen = () => {
          console.log(`WebSocket connected (symbol=${symbol})`);
        };

        websocket.onmessage = (event) => {
          const message = JSON.parse(event.data);
          if (message.data.type === "price-data") {
            next(message.data.price);
          }
        };

        websocket.onerror = (error) => {
          console.error(`WebSocket error (symbol=${symbol}):`, error);
          window.location.reload();
        };
        return () => {
          console.log(`Candlesticks socket closed symbol=${symbol}`);
          websocket.close();
        };
      })
    )
);

export const PriceData = ({ symbol }: IPriceDataProps) => {
  const [price, setPrice] = useState(null);

  useEffect(() => {
    // Connect to WebSocket
    const unCandle = createEmitter(symbol).connect(setPrice);
    // Cleanup on unmount
    return () => {
      unCandle();
    };
  }, []);

  return (
    <Typography variant="body1" sx={{ padding: 2, color: "white" }}>
      {price ? `${formatAmount(price)}$` : "Connecting..."}
    </Typography>
  );
};

export default PriceData;
