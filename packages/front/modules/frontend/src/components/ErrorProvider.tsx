import * as React from "react";
import { useEffect, useState } from "react";
import ErrorView from "./common/ErrorView";
import { ioc } from "../lib";

interface IAlertProviderProps {
  children: React.ReactChild;
}

export const ErrorProvider = ({ children }: IAlertProviderProps) => {
  const [error, setError] = useState(false);

  useEffect(
    () =>
      ioc.errorService.errorSubject.subscribe(() => {
        setError(true);
      }),
    [],
  );

  return (
    <>
      {children}
      {!!error && <ErrorView />}
    </>
  );
};

export default ErrorProvider;
