import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import { makeStyles } from "../../styles/makeStyles";
import { PortalView } from "react-declarative";

const useStyles = makeStyles()((theme) => ({
  root: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9999,
    background: theme.palette.background.default,
    height: "100vh",
    width: "100vw",
    display: "flex",
    alignItems: "center",
    flexDirection: "column",
    gap: 20,
    padding: 15,
  },
  container: {
    position: "relative",
    overflow: "hidden",
    minWidth: 375,
    maxWidth: 375,
    padding: 15,
  },
  reveal: {
    width: "auto !important",
  },
}));

const ERROR_LABEL =
  "Данные устарели. Обновите страницу";
const OFFLINE_LABEL = "Отключен от сервера";

interface IErrorViewProps {
  onLine?: boolean;
}

export const ErrorView = ({ onLine = navigator.onLine }: IErrorViewProps) => {
  const { classes } = useStyles();

  return (
    <PortalView>
      <Box className={classes.root}>
        <Box className={classes.reveal}>
          <Paper className={classes.container}>
            <Stack direction="column" gap="15px">
              <span>{onLine ? ERROR_LABEL : OFFLINE_LABEL}</span>
              <Button variant="contained" onClick={() => window.location.reload()}>
                {onLine ? "Перезагрузить страницу" : "Переподключиться"}
              </Button>
            </Stack>
          </Paper>
        </Box>
      </Box>
    </PortalView>
  );
};

export default ErrorView;
