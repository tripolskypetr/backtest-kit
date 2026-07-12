import { useMemo, useState } from "react";
import {
  WizardContainer,
  WizardNavigation,
  IWizardModalProps,
  formatAmount,
  useOnce,
  getErrorMessage,
} from "react-declarative";
import { Box } from "@mui/material";
import StatusCard from "../components/StatusCard";
import ioc from "../../../../../../lib";
import { IAverageBuyPayload } from "../useAverageBuyModal";
import { t } from "../../../../../../i18n";

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

  const { cost, note, symbol } = useMemo(() => {
    const { cost, note, symbol } = formState.data.form;
    return {
      cost: cost as string,
      note: note as string,
      symbol: symbol as string,
    };
  }, [formState]);

  useOnce(async () => {
    setLoading(true);
    try {
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
          title={t("Averaging Error")}
          description={state.error}
          amount={`${formatAmount(parseFloat(cost || "0"))}${t("$")}`}
          symbol={symbol}
        />
      );
    }
    if (state.loading) {
      return (
        <StatusCard
          type="loading"
          title={t("Averaging Position")}
          description={t("Please wait. Your operation is being processed...")}
          amount={`${formatAmount(parseFloat(cost || "0"))}${t("$")}`}
          symbol={symbol}
        />
      );
    }
    return (
      <StatusCard
        type="success"
        title={t("Position Averaged")}
        description={t("Averaging has been scheduled successfully. Waiting for the order to be executed on the exchange")}
        amount={`${formatAmount(parseFloat(cost || "0"))}${t("$")}`}
        symbol={symbol}
      />
    );
  };

  const renderNavigation = () => (
    <WizardNavigation
      hasNext={state.success || !!state.error}
      labelNext={t("Close")}
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
