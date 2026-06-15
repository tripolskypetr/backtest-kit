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
import { IBreakevenPayload } from "../useBreakevenModal";

export const SubmitView = ({
  formState,
  payload,
  beginSave,
  setLoading,
}: IWizardModalProps) => {
  const { symbol } = useMemo(() => {
    const { symbol } = formState.data.form;
    return {
      symbol: symbol as string,
    };
  }, [formState]);

  const [success, { error, loading }] = useAsyncValue(
    async () => {
      const context = payload.getContext() as IBreakevenPayload;
      await ioc.controlViewService.commitBreakeven(context.symbol, {
        strategyName: context.strategyName,
        exchangeName: context.exchangeName,
      });
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
          title="Breakeven Error"
          description="An error occurred while moving to breakeven"
          symbol={symbol}
        />
      );
    }
    if (loading || !success) {
      return (
        <StatusCard
          type="loading"
          title="Moving to Breakeven"
          description="Please wait. Your operation is being processed..."
          symbol={symbol}
        />
      );
    }
    return (
      <StatusCard
        type="success"
        title="Breakeven Set"
        description="Congratulations! The stop-loss was moved to breakeven"
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
