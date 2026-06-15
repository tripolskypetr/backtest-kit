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
import { IOpenPendingPayload } from "../useOpenPendingModal";

export const SubmitView = ({
  formState,
  payload,
  beginSave,
  setLoading,
}: IWizardModalProps) => {
  const { position, cost, note, symbol } = useMemo(() => {
    const { position, cost, note, symbol } = formState.data.form;
    return {
      position: position as "long" | "short",
      cost: cost as string,
      note: note as string,
      symbol: symbol as string,
    };
  }, [formState]);

  const [success, { error, loading }] = useAsyncValue(
    async () => {
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
          title="Ошибка открытия позиции"
          description="Во время открытия позиции произошла ошибка"
          amount={`${formatAmount(parseFloat(cost || "0"))}$`}
          symbol={symbol}
        />
      );
    }
    if (loading || !success) {
      return (
        <StatusCard
          type="loading"
          title="Открытие позиции"
          description="Пожалуйста, подождите. Ваша операция обрабатывается..."
          amount={`${formatAmount(parseFloat(cost || "0"))}$`}
          symbol={symbol}
        />
      );
    }
    return (
      <StatusCard
        type="success"
        title="Позиция открыта"
        description="Поздравляем! Позиция была успешно открыта"
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
