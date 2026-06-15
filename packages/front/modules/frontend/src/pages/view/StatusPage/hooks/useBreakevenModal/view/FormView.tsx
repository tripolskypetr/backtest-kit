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
          placeholder: "Перенос в безубыток",
        },
        {
          type: FieldType.Outline,
          fields: [
            {
              type: FieldType.Typography,
              typoVariant: "body1",
              placeholder:
                "Стоп-лосс будет перенесён в точку безубытка по текущей позиции. Дополнительный ввод не требуется.",
            },
          ],
        },
        {
          type: FieldType.Typography,
          fieldBottomMargin: "3",
          typoVariant: "caption",
          sx: { pt: 2, opacity: 0.5, fontSize: 12 },
          placeholder: `${typo.bullet} После нажатия на кнопку Далее перенос в безубыток будет совершён НЕЗАМЕДЛИТЕЛЬНО`,
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
            onChange({ symbol: formState.data.brief.symbol });
            await waitForChanges();
            history.replace("/submit");
          }}
        />
      }
    >
      <One
        payload={() => ({ averagePrice: formState.data.brief.averagePrice })}
        slots={defaultSlots}
        fields={fields}
        sx={{ pt: 1 }}
      />
    </WizardContainer>
  );
};

export default FormView;
