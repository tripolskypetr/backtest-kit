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
import { IBreakevenPayload } from "../useBreakevenModal";
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

  const { symbol } = useMemo(() => {
    const { symbol } = formState.data.form;
    return {
      symbol: symbol as string,
    };
  }, [formState]);

  useOnce(async () => {
    setLoading(true);
    try {
      const context = payload.getContext() as IBreakevenPayload;
      await ioc.controlViewService.commitBreakeven(context.symbol, {
        strategyName: context.strategyName,
        exchangeName: context.exchangeName,
      });
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
          title={t("Breakeven Error")}
          description={state.error}
          symbol={symbol}
        />
      );
    }
    if (state.loading) {
      return (
        <StatusCard
          type="loading"
          title={t("Moving to Breakeven")}
          description={t("Please wait. Your operation is being processed...")}
          symbol={symbol}
        />
      );
    }
    return (
      <StatusCard
        type="success"
        title={t("Breakeven Set")}
        description={t("Breakeven has been scheduled successfully. Waiting for the order to be executed on the exchange")}
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
