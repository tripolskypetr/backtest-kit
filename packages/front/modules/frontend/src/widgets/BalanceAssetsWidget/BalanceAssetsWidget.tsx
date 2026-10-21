import {
  Box,
  List,
  ListItem,
  ListItemText,
  Paper,
  Typography,
} from "@mui/material";
import { SxProps } from "@mui/system";
import { formatAmount } from "react-declarative";

import { IBalanceAsset } from "../../model/Budget.model";
import { t } from "../../i18n";

interface IBalanceAssetsWidgetProps {
  items: IBalanceAsset[];
  sx: SxProps;
}

export const BalanceAssetsWidget = ({ items, sx }: IBalanceAssetsWidgetProps) => (
  <Paper
    sx={{
      display: "flex",
      alignItems: "stretch",
      justifyContent: "stretch",
      flexDirection: "column",
      overflow: "clip",
      ...sx,
    }}
  >
    <Box
      sx={{
        minHeight: "36px",
        display: "flex",
        alignItems: "center",
        fontWeight: 700,
        fontSize: "18px",
        padding: "10px",
        borderBottom: (theme) => `1px solid ${theme.palette.divider}`,
      }}
    >
      {t("Assets")}
    </Box>
    {items.length ? (
      <List sx={{ flex: 1, overflowY: "auto", py: 0 }}>
        {items.map(({ asset, amount }, idx) => (
          <ListItem
            key={asset}
            sx={{
              background: idx % 2 ? "transparent" : "rgba(128, 128, 128, 0.08)",
            }}
          >
            <ListItemText primary={asset} />
            <Typography fontWeight="bold">{formatAmount(amount)}</Typography>
          </ListItem>
        ))}
      </List>
    ) : (
      <Box
        sx={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          opacity: 0.5,
        }}
      >
        <Typography variant="h6">{t("No assets")}</Typography>
      </Box>
    )}
  </Paper>
);

export default BalanceAssetsWidget;
