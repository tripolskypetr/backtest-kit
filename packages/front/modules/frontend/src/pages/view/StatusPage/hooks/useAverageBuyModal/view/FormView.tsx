import { Close } from "@mui/icons-material";
import {
  FieldType,
  One,
  WizardContainer,
  WizardNavigation,
  IWizardModalProps,
  TypedField,
  useRenderWaiter,
  typo,
} from "react-declarative";
import { defaultSlots } from "../../../../../../components/OneSlotFactory";
import { useState } from "react";

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
          placeholder: "Average Position",
        },
        {
          type: FieldType.Outline,
          fields: [
            {
              type: FieldType.Text,
              name: "cost",
              inputPattern: "[0-9]*",
              inputMode: "numeric",
              inputType: "tel",
              trailingIcon: Close,
              trailingIconClick: (v, {}, {}, onValueChange) => {
                onValueChange("");
              },
              validation: {
                required: true,
              },
              title: "Amount USDT",
              placeholder: "00000",
              inputFormatterSymbol: "0",
              inputFormatterAllowed: /[0-9]/,
              defaultValue: "100",
            },
            {
              type: FieldType.Text,
              outlined: true,
              name: "quantity",
              sx: {
                cursor: "not-allowed",
                "& *": {
                  cursor: "not-allowed",
                },
              },
              title: "Coin Quantity",
              placeholder: "0.00",
              compute: (data, payload) => {
                const amount = parseFloat(data.cost || "0");
                const price = parseFloat(payload.averagePrice || "0");
                if (!amount || !price) return "0";
                return (amount / price).toFixed(6);
              },
              inputFormatterSymbol: "0",
              inputFormatterAllowed: /[0-9.]/,
              readonly: true,
            },
            {
              type: FieldType.Text,
              name: "note",
              title: "Note",
              placeholder: "Reason for averaging the position",
            },
          ],
        },
        {
          type: FieldType.Typography,
          fieldBottomMargin: "3",
          typoVariant: "caption",
          sx: { pt: 2, opacity: 0.5, fontSize: 12 },
          placeholder: `${typo.bullet} After pressing the Next button, the averaging will be performed IMMEDIATELY`,
        },
      ],
    },
  },
];

export const FormView = ({
  data: upperData,
  history,
  formState,
  onChange,
}: IWizardModalProps) => {
  const [data, setData] = useState(upperData);

  const waitForChanges = useRenderWaiter([upperData], 50);

  return (
    <WizardContainer
      Navigation={
        <WizardNavigation
          hasPrev
          hasNext
          labelPrev="Back"
          onPrev={async () => {
            history.replace("/brief");
          }}
          onNext={async () => {
            if (data) {
              onChange({
                cost: data.cost,
                note: data.note,
                symbol: formState.data.brief.symbol,
              });
              await waitForChanges();
              history.replace("/submit");
            }
          }}
        />
      }
    >
      <One
        payload={() => ({ averagePrice: formState.data.brief.averagePrice })}
        onChange={(data) => setData(data)}
        slots={defaultSlots}
        fields={fields}
        sx={{ pt: 1 }}
      />
    </WizardContainer>
  );
};

export default FormView;
