import { useMemo, useState } from "react";
import {
  WizardContainer,
  WizardNavigation,
  IWizardModalProps,
  useAsyncValue,
  formatAmount,
  useOnce,
  getErrorMessage,
} from "react-declarative";
import { Box } from "@mui/material";
import StatusCard from "../components/StatusCard";
import ioc from "../../../../../../lib";
import { IOpenPendingPayload } from "../useOpenPendingModal";

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

  const { position, cost, note, symbol } = useMemo(() => {
    const { position, cost, note, symbol } = formState.data.form;
    return {
      position: position as "long" | "short",
      cost: cost as string,
      note: note as string,
      symbol: symbol as string,
    };
  }, [formState]);

  useOnce(async () => {
    setLoading(true);
    try {
      const context = payload.getContext() as IOpenPendingPayload;
      await ioc.controlViewService.commitOpenPending(
        context.symbol,
        {
          strategyName: context.strategyName,
          exchangeName: context.exchangeName,
        },
        {
          position,
          cost: parseFloat(cost || "0"),
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
          title="Position Opening Error"
          description={state.error}
          amount={`${formatAmount(parseFloat(cost || "0"))}$`}
          symbol={symbol}
        />
      );
    }
    if (state.loading) {
      return (
        <StatusCard
          type="loading"
          title="Opening Position"
          description="Please wait. Your operation is being processed..."
          amount={`${formatAmount(parseFloat(cost || "0"))}$`}
          symbol={symbol}
        />
      );
    }
    return (
      <StatusCard
        type="success"
        title="Position Opened"
        description="Position has been scheduled successfully. Waiting for pending order"
        amount={`${formatAmount(parseFloat(cost || "0"))}$`}
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
