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
          title="Ошибка усреднения"
          description="Во время усреднения позиции произошла ошибка"
          amount={`${formatAmount(parseFloat(cost || "0"))}$`}
          symbol={symbol}
        />
      );
    }
    if (loading || !success) {
      return (
        <StatusCard
          type="loading"
          title="Усреднение позиции"
          description="Пожалуйста, подождите. Ваша операция обрабатывается..."
          amount={`${formatAmount(parseFloat(cost || "0"))}$`}
          symbol={symbol}
        />
      );
    }
    return (
      <StatusCard
        type="success"
        title="Позиция усреднена"
        description="Поздравляем! Усреднение позиции было успешно выполнено"
        amount={`${formatAmount(parseFloat(cost || "0"))}$`}
        symbol={symbol}
      />
    );
  };

  const renderNavigation = () => (
    <WizardNavigation
      hasNext={success || !!error}
      labelNext="Закрыть"
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
