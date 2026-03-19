import { Download, KeyboardArrowLeft, Refresh } from "@mui/icons-material";
import { Container } from "@mui/material";
import {
  Breadcrumbs2,
  Breadcrumbs2Type,
  FieldType,
  IBreadcrumbs2Action,
  IBreadcrumbs2Option,
  One,
  Subject,
  TypedField,
  useSingleton,
} from "react-declarative";
import history from "../../config/history";
import IconWrapper from "../../components/common/IconWrapper";
import ChartWidget from "../../widgets/ChartWidget";

const actions: IBreadcrumbs2Action[] = [
  {
    action: "update-now",
    label: "Обновить",
    icon: () => <IconWrapper icon={Refresh} color="#4caf50" />,
  },
  {
    divider: true,
  },
  {
    action: "download-now",
    label: "Скачать",
    icon: () => <IconWrapper icon={Download} color="#4caf50" />,
  },
];

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
  {
    type: Breadcrumbs2Type.Link,
    action: "back-action",
    compute: ({ symbol }) => String(symbol).toUpperCase(),
  },
  {
    type: Breadcrumbs2Type.Link,
    action: "back-action",
    compute: ({ source }) => String(source).toUpperCase(),
  },
];

interface IDataViewProps {
  symbol: string;
  source: string;
}

function removeQueryParam(param: string) {
  const url = new URL(location.href, location.origin);
  url.searchParams.delete(param);
  window.history.replaceState({}, '', url);
}

const reloadSubject = new Subject<void>();
const downloadSubject = new Subject<void>();

export const DataView = ({ symbol, source }: IDataViewProps) => {
  const handleAction = async (action: string) => {
    if (action === "back-action") {
      removeQueryParam("term");
      history.push(`/coin/${symbol}`);
    }
    if (action === "update-now") {
      await reloadSubject.next();
    }
    if (action === "download-now") {
      await downloadSubject.next();
    }
  };

  const payload = useSingleton(() => ({
    symbol,
    source,
  }));

  return (
    <Container>
      <Breadcrumbs2
        items={options}
        actions={actions}
        payload={payload}
        onAction={handleAction}
      />
      <ChartWidget
        reloadSubject={reloadSubject}
        downloadSubject={downloadSubject}
        sx={{ height: "calc(100dvh - 100px)" }}
        symbol={symbol}
        source={source}
      />
    </Container>
  );
};

export default DataView;
