import {
  Box,
  Button,
  ButtonBase,
  Chip,
  Container,
  darken,
  getContrastRatio,
  lighten,
  Paper,
  Stack,
} from "@mui/material";
import {
  Breadcrumbs2,
  Breadcrumbs2Type,
  Center,
  FieldType,
  IBreadcrumbs2Action,
  IBreadcrumbs2Option,
  IOutletProps,
  One,
  TypedField,
  typo,
  openBlank,
  useSingleshot,
  useSingleton,
  useAsyncValue,
} from "react-declarative";
import { makeStyles } from "../../styles";
import IconWrapper from "../../components/common/IconWrapper";
import { KeyboardArrowLeft, Quickreply } from "@mui/icons-material";
import history from "../../config/history";
import { getParams } from "./utils/getParams";
import CandleView from "./components/CandleView";
import { fetchSymbolList } from "./api/fetchSymbolList";
import { fetchSymbolMap } from "./api/fetchSymbolMap";
import IconPhoto from "./components/IconPhoto";

const GROUP_HEADER = "trade-gpt__groupHeader";
const GROUP_ROOT = "trade-gpt__groupRoot";

const ICON_ROOT = "trade-gpt__symbolImage";

const useStyles = makeStyles()({
  root: {
    [`& .${GROUP_ROOT}:hover .${GROUP_HEADER}`]: {
      opacity: "1 !important",
    },
  },
});

interface IRoute {
  label: string;
  symbol: string;
  color: string;
  to: string;
}

function isLightColor(hex: string) {
  // Compare contrast with black (#000000) and white (#FFFFFF)
  const contrastWithBlack = getContrastRatio(hex, "#000000");
  const contrastWithWhite = getContrastRatio(hex, "#FFFFFF");

  // If contrast with black is higher, the color is likely light
  return contrastWithBlack > contrastWithWhite;
}

const options: IBreadcrumbs2Option[] = [
  {
    type: Breadcrumbs2Type.Link,
    action: "back-action",
    label: <KeyboardArrowLeft sx={{ display: "block" }} />,
  },
  {
    type: Breadcrumbs2Type.Link,
    action: "back-action",
    label: "Дэшборд",
  },
  {
    type: Breadcrumbs2Type.Link,
    action: "back-action",
    label: "Меню",
  },
];

const createButton = (
  symbol: string,
  to: string,
  label: React.ReactNode,
  color: string
): TypedField => ({
  type: FieldType.Component,
  desktopColumns: "6",
  tabletColumns: "6",
  phoneColumns: "12",
  fieldRightMargin: "1",
  fieldBottomMargin: "1",
  element: ({ payload }) => (
    <Button
      component={ButtonBase}
      onClick={() => {
        history.push(to);
      }}
      sx={{
        width: "100%",
        background: color,
        color: "white",
        fontWeight: "bold",
        fontSize: "14px",
        height: "75px",
        minHeight: "75px",
        textWrap: "wrap",
        padding: "16px",
        [`& .${ICON_ROOT}`]: {
          transition: "filter 500ms",
        },
        "&:hover": {
          background: () =>
            isLightColor(color) ? darken(color, 0.33) : lighten(color, 0.33),
          [`& .${ICON_ROOT}`]: {
            transition: "filter 500ms",
            filter: isLightColor(color)
              ? "brightness(0.7) contrast(1.2)"
              : "brightness(1.3) contrast(0.5)",
          },
        },
        transition: "background 500ms",
      }}
      startIcon={<IconPhoto className={ICON_ROOT} symbol={symbol} />}
    >
      {label}
    </Button>
  ),
});

const createFields = async (): Promise<TypedField[]> => {
  const symbolMap = await fetchSymbolMap();

  // Статические символы для совместимости
  const staticSymbols = await fetchSymbolList();

  // Группируем символы по priority
  const priorityGroups: Record<number, IRoute[]> = {};

  staticSymbols.forEach((symbol, idx) => {
    const symbolData = symbolMap[symbol];
    const index = idx + 1;
    const priority = symbolData?.priority || index;

    if (!priorityGroups[priority]) {
      priorityGroups[priority] = [];
    }

    priorityGroups[priority].push({
      symbol,
      label: symbolData?.displayName || symbol,
      color: symbolData?.color || "#ccc",
      to: `/coin/${symbol.toLowerCase()}`,
    });
  });

  const sortedPriorities = Object.entries(priorityGroups)
    .map(([priority, routes]) => ({ priority: parseInt(priority), routes }))
    .sort(
      (
        { priority: a_p, routes: { length: a_l } },
        { priority: b_p, routes: { length: b_l } }
      ) => b_l - a_l || b_p - a_p
    );

  const tabletLeftColumn: TypedField[] = [];
  const tabletRightColumn: TypedField[] = [];
  const wideColumn: TypedField[] = [];

  sortedPriorities.forEach(({ routes, priority }, idx) => {
    const group = createGroup(`Priority ${priority}`, routes);

    if (idx % 2 === 0) {
      tabletLeftColumn.push(group);
    }

    if (idx % 2 === 1) {
      tabletRightColumn.push(group);
    }

    wideColumn.push(group);
  });

  const fields: TypedField[] = [
    {
      type: FieldType.Group,
      columns: "6",
      className: "tabletLeftColumn",
      phoneHidden: true,
      desktopHidden: true,
      fields: tabletLeftColumn,
    },
    {
      type: FieldType.Group,
      columns: "6",
      className: "tabletRightColumn",
      phoneHidden: true,
      desktopHidden: true,
      fields: tabletRightColumn,
    },
    {
      type: FieldType.Group,
      columns: "12",
      className: "wideColumn",
      tabletHidden: true,
      fields: wideColumn,
    },
  ];

  return fields;
};

const createGroup = (label: string, routes: IRoute[]): TypedField => ({
  type: FieldType.Group,
  className: GROUP_ROOT,
  sx: {
    p: 2,
  },
  tabletColumns: "12",
  desktopColumns: "3",
  fields: [
    {
      type: FieldType.Component,
      className: GROUP_HEADER,
      style: {
        transition: "opacity 500ms",
        opacity: 0.5,
      },
      element: () => (
        <Stack direction="row">
          <Chip
            variant="outlined"
            size="small"
            color="info"
            label={`${typo.bullet} ${label}`}
            sx={{
              mb: 1,
              pr: 0.5,
              fontSize: "14px",
              background: "white",
              cursor: "not-allowed",
            }}
          />
          <Box flex={1} />
        </Stack>
      ),
    },
    {
      type: FieldType.Group,
      fields: routes.map(({ symbol, label, to, color }) =>
        createButton(symbol, to, label, color)
      ),
    },
  ],
});

export const MainPage = ({ history, payload, ...other }: IOutletProps) => {
  const { classes } = useStyles();

  const params = useSingleton(getParams);

  const [fields, { loading }] = useAsyncValue(async () => {
    return await createFields();
  });

  const handleAction = (action: string) => {
    if (action === "back-action") {
      openBlank("/");
      window.close();
    }
  };

  if (params.term) {
    return (
      <CandleView
        term={params.term!}
        history={history}
        payload={payload}
        {...other}
      />
    );
  }

  if (loading || !fields) {
    return (
      <Container>
        <Breadcrumbs2 items={options} onAction={handleAction} />
        <Center>
          <p>Загрузка...</p>
        </Center>
      </Container>
    );
  }

  return (
    <Container>
      <Breadcrumbs2 items={options} onAction={handleAction} />
      <One
        className={classes.root}
        fields={fields}
        payload={() => ({
          ...payload,
          history,
        })}
      />
      <Box paddingBottom="24px" />
    </Container>
  );
};

export default MainPage;
