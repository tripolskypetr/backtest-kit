import React from "react";
import { Box } from "@mui/material";
import { Async } from "react-declarative";
import ioc from "../../lib";

interface IconPhotoProps {
  className?: string;
  symbol: string;
  style?: React.CSSProperties;
  sx?: any;
}

export const IconPhoto: React.FC<IconPhotoProps> = ({ className, symbol, style, sx }) => {
  return (
    <Async>
      {async () => {
        try {
          const symbolMap = await ioc.symbolGlobalService.getSymbolMap();
          const symbolData = symbolMap[symbol];

          const iconUrl = symbolData?.icon;
          const fallbackColor = symbolData?.color || "#ccc";

          return (
            <Box
              className={className}
              sx={{
                position: "relative",
                width: 24,
                height: 24,
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: iconUrl ? "transparent" : fallbackColor,
                ...sx,
              }}
              style={style}
            >
              {iconUrl ? (
                <img
                  loading="lazy"
                  crossOrigin="anonymous"
                  src={iconUrl}
                  alt={symbol}
                  style={{
                    width: "100%",
                    height: "100%",
                    borderRadius: "50%",
                    objectFit: "contain",
                  }}
                  onError={(e) => {
                    // Fallback to color background if image fails to load
                    const target = e.target as HTMLImageElement;
                    const parent = target.parentElement;
                    if (parent) {
                      parent.style.background = fallbackColor;
                      target.style.display = "none";
                    }
                  }}
                />
              ) : (
                <Box
                  sx={{
                    width: "60%",
                    height: "60%",
                    borderRadius: "50%",
                    backgroundColor: "rgba(255, 255, 255, 0.2)",
                  }}
                />
              )}
            </Box>
          );
        } catch (error) {
          // Error fallback
          return (
            <Box
              className={className}
              sx={{
                position: "relative",
                width: 24,
                height: 24,
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "#ccc",
                ...sx,
              }}
              style={style}
            >
              <Box
                sx={{
                  width: "60%",
                  height: "60%",
                  borderRadius: "50%",
                  backgroundColor: "rgba(255, 255, 255, 0.2)",
                }}
              />
            </Box>
          );
        }
      }}
    </Async>
  );
};

export default IconPhoto;