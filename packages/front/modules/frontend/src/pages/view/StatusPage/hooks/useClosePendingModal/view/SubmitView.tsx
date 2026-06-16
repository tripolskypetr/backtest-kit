import { useMemo, useState } from "react";
import {
  WizardContainer,
  WizardNavigation,
  IWizardModalProps,
  useOnce,
  getErrorMessage,
} from "react-declarative";
import { Box } from "@mui/material";
import StatusCard from "../components/StatusCard";
import ioc from "../../../../../../lib";
import { IClosePendingPayload } from "../useClosePendingModal";

interface IState {
  success: boolean;
  error: string;
  loading: boolean;
}

const INITIAL_STATE = {
  success: false,
  loading: true,
  error: "",
};

export const SubmitView = ({
  formState,
  payload,
  beginSave,
  setLoading,
}: IWizardModalProps) => {

  const [state, setState] = useState<IState>(INITIAL_STATE);

  const { note, symbol } = useMemo(() => {
    const { note, symbol } = formState.data.form;
    return {
      note: note as string,
      symbol: symbol as string,
    };
  }, [formState]);

  useOnce(async () => {
    setLoading(true);
    try {
      const context = payload.getContext() as IClosePendingPayload;
      await ioc.controlViewService.commitClosePending(
        context.symbol,
        {
          strategyName: context.strategyName,
          exchangeName: context.exchangeName,
        },
        {
          note: note || "",
        },
      );
      setState({
        success: true,
        loading: false,
        error: "",
      })
    } catch (error) {
      setState({
        success: false,
        loading: false,
        error: getErrorMessage(error),
      })
    } finally {
      setLoading(false);
    }
  });

  const renderInner = () => {
    if (state.error) {
      return (
        <StatusCard
          type="error"
          title="Position Closing Error"
          description={state.error}
          symbol={symbol}
        />
      );
    }
    if (state.loading) {
      return (
        <StatusCard
          type="loading"
          title="Closing Position"
          description="Please wait. Your operation is being processed..."
          symbol={symbol}
        />
      );
    }
    return (
      <StatusCard
        type="success"
        title="Position Closed"
        description="Position has been closed successfully"
        symbol={symbol}
      />
    );
  };

  const renderNavigation = () => (
    <WizardNavigation
      hasNext={state.success || !!state.error}
      labelNext="Close"
      onNext={async () => {
        await beginSave();
      }}
    />
  );

  return (
    <WizardContainer Navigation={renderNavigation()}>
      <Box p={1}>{renderInner()}</Box>
    </WizardContainer>
  );
};

export default SubmitView;
