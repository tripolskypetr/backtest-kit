import {
  FieldType,
  One,
  WizardContainer,
  WizardNavigation,
  IWizardModalProps,
  TypedField,
  useAsyncValue,
  formatAmount,
  useRenderWaiter,
  typo,
} from "react-declarative";
import { defaultSlots } from "../../../../../../components/OneSlotFactory";
import ioc from "../../../../../../lib";
import { IClosePendingPayload } from "../useClosePendingModal";

const fields: TypedField[] = [
  {
    type: FieldType.Center,
    child: {
      type: FieldType.Group,
      desktopColumns: "6",
      tabletColumns: "12",
      phoneColumns: "12",
      fields: [
        {
          type: FieldType.Typography,
          style: { opacity: 0.5 },
          fieldBottomMargin: "3",
          typoVariant: "h6",
          placeholder: "Закрытие позиции",
        },
        {
          type: FieldType.Outline,
          fields: [
            {
              type: FieldType.Text,
              name: "symbol",
              compute: ({}, payload) => payload.symbol,
              title: "Символ",
            },
            {
              type: FieldType.Text,
              name: "price",
              inputPattern: "[0-9\.]*",
              inputMode: "decimal",
              inputType: "tel",
              compute: ({}, payload) => `${formatAmount(payload.averagePrice)}$`,
              title: "Цена монеты",
              placeholder: "000000.00",
              inputFormatterSymbol: "0",
              inputFormatterAllowed: /[0-9.]/,
            },
          ],
        },
        {
          type: FieldType.Typography,
          fieldBottomMargin: "3",
          typoVariant: "caption",
          sx: { pt: 2, opacity: 0.5, fontSize: 12 },
          placeholder: `${typo.bullet} Внимательно проверьте, что это та монета, по которой вы желаете закрыть позицию. Ориентируйтесь на символ И ЦЕНУ`,
        },
      ],
    },
  },
];

export const BriefView = ({
  data,
  payload,
  history,
  onChange,
  onClose,
  setLoading,
}: IWizardModalProps) => {
  const waitForChanges = useRenderWaiter([data], 50);

  const [info, { loading }] = useAsyncValue(
    async () => {
      const context = payload.getContext() as IClosePendingPayload;
      const averagePrice = await ioc.controlViewService.getAveragePrice(
        context.symbol,
        {
          strategyName: context.strategyName,
          exchangeName: context.exchangeName,
        },
      );
      return {
        averagePrice,
        symbol: context.symbol,
      };
    },
    {
      onLoadStart: () => setLoading(true),
      onLoadEnd: () => setLoading(false),
    },
  );

  const renderInner = () => {
    if (!info) {
      return null;
    }
    if (loading) {
      return null;
    }
    return (
      <One
        payload={() => ({
          averagePrice: info.averagePrice,
          symbol: info.symbol,
        })}
        slots={defaultSlots}
        fields={fields}
      />
    );
  };

  return (
    <WizardContainer
      Navigation={
        <WizardNavigation
          hasPrev
          hasNext={!!info}
          labelPrev="Закрыть"
          onPrev={async () => {
            await onClose();
          }}
          onNext={async () => {
            onChange({ averagePrice: info.averagePrice, symbol: info.symbol });
            await waitForChanges();
            history.replace("/form");
          }}
        />
      }
    >
      {renderInner()}
    </WizardContainer>
  );
};

export default BriefView;
