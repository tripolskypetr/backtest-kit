import { useMemo } from "react";
import {
  WizardContainer,
  WizardNavigation,
  IWizardModalProps,
  useAsyncValue,
  formatAmount,
} from "react-declarative";
import { Box } from "@mui/material";
import StatusCard from "../components/StatusCard";
import ioc from "../../../../../../lib";
import { IAverageBuyPayload } from "../useAverageBuyModal";

export const SubmitView = ({
  formState,
  payload,
  beginSave,
  setLoading,
}: IWizardModalProps) => {
  const { cost, note, symbol } = useMemo(() => {
    const { cost, note, symbol } = formState.data.form;
    return {
      cost: cost as string,
      note: note as string,
      symbol: symbol as string,
    };
  }, [formState]);

  const [success, { error, loading }] = useAsyncValue(
    async () => {
      const context = payload.getContext() as IAverageBuyPayload;
      await ioc.controlViewService.commitAverageBuy(
        context.symbol,
        {
          strategyName: context.strategyName,
          exchangeName: context.exchangeName,
        },
        {
          cost: parseFloat(cost || "0"),
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
          title="Averaging Error"
          description="An error occurred while averaging the position"
          amount={`${formatAmount(parseFloat(cost || "0"))}$`}
          symbol={symbol}
        />
      );
    }
    if (loading || !success) {
      return (
        <StatusCard
          type="loading"
          title="Averaging Position"
          description="Please wait. Your operation is being processed..."
          amount={`${formatAmount(parseFloat(cost || "0"))}$`}
          symbol={symbol}
        />
      );
    }
    return (
      <StatusCard
        type="success"
        title="Position Averaged"
        description="Congratulations! The position was averaged successfully"
        amount={`${formatAmount(parseFloat(cost || "0"))}$`}
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
