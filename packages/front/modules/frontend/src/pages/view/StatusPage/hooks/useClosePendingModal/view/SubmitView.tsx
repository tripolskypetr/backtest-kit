import { useMemo } from "react";
import {
  WizardContainer,
  WizardNavigation,
  IWizardModalProps,
  useAsyncValue,
} from "react-declarative";
import { Box } from "@mui/material";
import StatusCard from "../components/StatusCard";
import ioc from "../../../../../../lib";
import { IClosePendingPayload } from "../useClosePendingModal";

export const SubmitView = ({
  formState,
  payload,
  beginSave,
  setLoading,
}: IWizardModalProps) => {
  const { note, symbol } = useMemo(() => {
    const { note, symbol } = formState.data.form;
    return {
      note: note as string,
      symbol: symbol as string,
    };
  }, [formState]);

  const [success, { error, loading }] = useAsyncValue(
    async () => {
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
      return true;
    },
    {
      onLoadStart: () => setLoading(true),
      onLoadEnd: () => setLoading(false),
    },
  );

  const renderInner = () => {
    if (error) {
      return (
        <StatusCard
          type="error"
          title="Position Closing Error"
          description="An error occurred while closing the position"
          symbol={symbol}
        />
      );
    }
    if (loading || !success) {
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
        description="Congratulations! The position was closed successfully"
        symbol={symbol}
      />
    );
  };

  const renderNavigation = () => (
    <WizardNavigation
      hasNext={success || !!error}
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
