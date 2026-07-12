import React from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  CircularProgress,
  Chip,
  useTheme,
  alpha,
} from '@mui/material';
import {
  CheckCircle,
  Error,
  Warning,
  Info,
  TrendingUp,
} from '@mui/icons-material';
import { t } from '../../../../../../i18n';

interface StatusCardProps {
  type: 'loading' | 'success' | 'error' | 'warning' | 'info';
  title: string;
  description?: string;
  amount?: string;
  price?: string;
  symbol?: string;
}

const StatusCard: React.FC<StatusCardProps> = ({
  type,
  title,
  description,
  amount,
  price,
  symbol,
}) => {
  const theme = useTheme();

  const getStatusConfig = () => {
    if (type === 'loading') {
      return {
        color: theme.palette.warning.main,
        bgColor: alpha(theme.palette.warning.main, 0.1),
        icon: <CircularProgress size={24} color="warning" />,
        chipColor: 'warning' as const,
      };
    }
    if (type === 'success') {
      return {
        color: theme.palette.success.main,
        bgColor: alpha(theme.palette.success.main, 0.1),
        icon: <CheckCircle />,
        chipColor: 'success' as const,
      };
    }
    if (type === 'error') {
      return {
        color: theme.palette.error.main,
        bgColor: alpha(theme.palette.error.main, 0.1),
        icon: <Error />,
        chipColor: 'error' as const,
      };
    }
    if (type === 'warning') {
      return {
        color: theme.palette.warning.main,
        bgColor: alpha(theme.palette.warning.main, 0.1),
        icon: <Warning />,
        chipColor: 'warning' as const,
      };
    }
    if (type === 'info') {
      return {
        color: theme.palette.info.main,
        bgColor: alpha(theme.palette.info.main, 0.1),
        icon: <Info />,
        chipColor: 'info' as const,
      };
    }
    return {
      color: theme.palette.grey[500],
      bgColor: alpha(theme.palette.grey[500], 0.1),
      icon: <Info />,
      chipColor: 'default' as const,
    };
  };

  const config = getStatusConfig();

  return (
    <Card
      elevation={0}
      sx={{
        backgroundColor: config.bgColor,
        border: `1px solid ${alpha(config.color, 0.3)}`,
        borderRadius: 2,
        transition: 'all 0.3s ease',
      }}
    >
      <CardContent sx={{ p: 3 }}>
        {/* Header with icon and title */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            mb: 2,
          }}
        >
          <Box
            sx={{
              color: config.color,
              display: 'flex',
              alignItems: 'center',
            }}
          >
            {config.icon}
          </Box>
          <Typography
            variant="h6"
            sx={{
              color: config.color,
              fontWeight: 600,
              flex: 1,
            }}
          >
            {title}
          </Typography>
          {symbol && (
            <Chip
              label={symbol}
              size="small"
              color={config.chipColor}
              variant="outlined"
              icon={<TrendingUp />}
            />
          )}
        </Box>

        {/* Description */}
        {description && (
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ mb: 2, lineHeight: 1.5 }}
          >
            {description}
          </Typography>
        )}

        {/* Transaction details */}
        {(amount || price) && (
          <Box
            sx={{
              display: 'flex',
              gap: 3,
              mt: 2,
              p: 2,
              backgroundColor: alpha(theme.palette.background.paper, 0.6),
              borderRadius: 1,
              border: `1px solid ${alpha(config.color, 0.1)}`,
            }}
          >
            {amount && (
              <Box>
                <Typography variant="caption" color="text.secondary">
                  {t("Amount")}
                </Typography>
                <Typography
                  variant="subtitle1"
                  sx={{
                    fontWeight: 600,
                    color: config.color,
                  }}
                >
                  {amount}
                </Typography>
              </Box>
            )}
            {price && (
              <Box>
                <Typography variant="caption" color="text.secondary">
                  {t("Price")}
                </Typography>
                <Typography
                  variant="subtitle1"
                  sx={{
                    fontWeight: 600,
                    color: config.color,
                  }}
                >
                  {price}
                </Typography>
              </Box>
            )}
          </Box>
        )}
      </CardContent>
    </Card>
  );
};

export default StatusCard;
