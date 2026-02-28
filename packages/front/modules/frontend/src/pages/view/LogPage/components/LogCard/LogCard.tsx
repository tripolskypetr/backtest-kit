import { dayjs, VirtualView } from "react-declarative";
import {
  Avatar,
  Box,
  Chip,
  Divider,
  Paper,
  Stack,
  SxProps,
  Typography,
} from "@mui/material";
import {
  BugReport,
  Info,
  Warning,
  Article,
} from "@mui/icons-material";
import { ILogEntry } from "backtest-kit";

interface ILogCardProps {
  data: ILogEntry;
  sx?: SxProps;
}

const getLogColor = (item: ILogEntry): string => {
  switch (item.type) {
    case "debug":
      return "#9E9E9E";
    case "info":
      return "#2196F3";
    case "warn":
      return "#FF9800";
    case "log":
      return "#4CAF50";
    default:
      return "#9E9E9E";
  }
};

const getLogIcon = (item: ILogEntry) => {
  const sx = { color: "white", fontSize: 28 };
  switch (item.type) {
    case "debug":
      return <BugReport sx={sx} />;
    case "info":
      return <Info sx={sx} />;
    case "warn":
      return <Warning sx={sx} />;
    case "log":
      return <Article sx={sx} />;
    default:
      return <Article sx={sx} />;
  }
};

export const LogCard = VirtualView.virtualize<ILogCardProps>(
  ({ data: item, sx }) => {
    const color = getLogColor(item);

    return (
      <Paper
        variant="outlined"
        sx={{
          display: "flex",
          alignItems: "stretch",
          justifyContent: "stretch",
          ...sx,
        }}
      >
        <Box
          sx={{
            flex: 1,
            position: "relative",
            overflow: "hidden",
            height: "100%",
            width: "100%",
            borderRadius: "12px",
          }}
        >
          <Stack direction="row" spacing={2} sx={{ p: 2 }}>
            <Avatar sx={{ width: 56, height: 56, background: color }}>
              {getLogIcon(item)}
            </Avatar>

            <Stack flex={1} spacing={1}>
              <Stack
                direction="row"
                justifyContent="space-between"
                alignItems="flex-start"
              >
                <Typography
                  variant="h6"
                  sx={{ fontWeight: 600, wordBreak: "break-all" }}
                >
                  {item.topic}
                </Typography>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ whiteSpace: "nowrap", ml: 2 }}
                >
                  {dayjs(item.createdAt).format("HH:mm DD/MM/YYYY")}
                </Typography>
              </Stack>

              <Stack direction="row" spacing={1} flexWrap="wrap">
                <Chip
                  size="small"
                  label={item.type.toUpperCase()}
                  sx={{ background: color, color: "white", fontWeight: 500 }}
                />
              </Stack>

              {item.args.length > 0 && (
                <>
                  <Divider sx={{ my: 1 }} />
                  <Box
                    component="pre"
                    sx={{
                      m: 0,
                      fontSize: "0.75rem",
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-all",
                      color: "text.secondary",
                    }}
                  >
                    {JSON.stringify(item.args.length === 1 ? item.args[0] : item.args, null, 2)}
                  </Box>
                </>
              )}
            </Stack>
          </Stack>

          <Box
            sx={{
              position: "absolute",
              top: 0,
              left: 0,
              bottom: 0,
              width: 6,
              zIndex: 1,
              background: color,
            }}
          />
        </Box>
      </Paper>
    );
  },
);

export default LogCard;
