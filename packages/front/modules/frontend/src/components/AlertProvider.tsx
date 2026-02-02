import * as React from "react";

import Snackbar from "@mui/material/Snackbar";
import { useState } from "react";
import { useOnce } from "react-declarative";
import { ioc } from "../lib";

const AUTO_HIDE_DURATION = 5000;

interface IAlertProviderProps {
  children: React.ReactChild;
}

export const AlertProvider = ({ children }: IAlertProviderProps) => {
  const [current, setCurrent] = useState(ioc.alertService.current);

  useOnce(() =>
    ioc.alertService.reloadSubject.subscribe(() => {
      setCurrent(ioc.alertService.current);
    }),
  );

  return (
    <>
      {!!current && (
        <Snackbar
          open
          key={current.key}
          anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
          autoHideDuration={current.pin ? undefined : AUTO_HIDE_DURATION}
          onClose={current.pin ? undefined : ioc.alertService.hideCurrent}
          sx={{ zIndex: 9999999 }}
          message={current.message}
        />
      )}
      {children}
    </>
  );
};

export default AlertProvider;
