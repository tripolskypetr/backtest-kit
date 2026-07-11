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
import { IAverageBuyPayload } from "../useAverageBuyModal";
import { t } from "../../../../../../i18n";

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
          placeholder: t("Average Position"),
        },
        {
          type: FieldType.Outline,
          fields: [
            {
              type: FieldType.Text,
              name: "symbol",
              compute: ({}, payload) => payload.symbol,
              title: t("Symbol"),
            },
            {
              type: FieldType.Text,
              name: "price",
              inputPattern: "[0-9\.]*",
              inputMode: "decimal",
              inputType: "tel",
              compute: ({}, payload) => `${formatAmount(payload.averagePrice)}${t("$")}`,
              title: t("Coin Price"),
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
          placeholder: `${typo.bullet} ${t("Carefully verify that this is the coin you want to average the position on. Rely on the symbol AND THE PRICE")}`,
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
      const context = payload.getContext() as IAverageBuyPayload;
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
          labelPrev={t("Close")}
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
