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
          placeholder: "Закрытие позиции",
        },
        {
          type: FieldType.Outline,
          fields: [
            {
              type: FieldType.Text,
              name: "note",
              title: "Заметка",
              placeholder: "Причина закрытия позиции",
            },
          ],
        },
        {
          type: FieldType.Typography,
          fieldBottomMargin: "3",
          typoVariant: "caption",
          sx: { pt: 2, opacity: 0.5, fontSize: 12 },
          placeholder: `${typo.bullet} После нажатия на кнопку Далее закрытие будет совершено НЕЗАМЕДЛИТЕЛЬНО`,
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
          labelPrev="Назад"
          onPrev={async () => {
            history.replace("/brief");
          }}
          onNext={async () => {
            if (data) {
              onChange({
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
