import {
  Breadcrumbs2,
  Breadcrumbs2Type,
  IBreadcrumbs2Action,
  IBreadcrumbs2Option,
  pickDocuments,
  Subject,
  useActualState,
  useActualValue,
  useAsyncAction,
  useOffsetPaginator,
  VirtualView,
} from "react-declarative";
import IconWrapper from "../../../components/common/IconWrapper";
import { Download, KeyboardArrowLeft, Refresh } from "@mui/icons-material";
import { Container } from "@mui/material";
import ioc from "../../../lib";
import { ILogEntry } from "backtest-kit";
import { CC_LIST_BUFFER_SIZE } from "../../../config/params";
import LogCard from "./components/LogCard";

const actions: IBreadcrumbs2Action[] = [
  {
    action: "download-action",
    label: "Download",
    icon: () => <IconWrapper icon={Download} color="#4caf50" />
  },
  {
    divider: true,
  },
  {
    action: "update-now",
    label: "Refresh manually",
    icon: () => <IconWrapper icon={Refresh} color="#4caf50" />,
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
    label: "Main",
  },
  {
    type: Breadcrumbs2Type.Link,
    action: "back-action",
    label: "Logs",
  },
];

const reloadSubject = new Subject<void>();

export const LogPage = () => {

  const [filterData$, setFilterData] = useActualState("");

  const { data, hasMore, loading, onSkip } = useOffsetPaginator({
    handler: async (limit, offset) => {
      const logList = await ioc.logViewService.getList();
      const iter = pickDocuments<ILogEntry>(limit, offset);
      for (const log of logList) {
        if (!new RegExp(filterData$.current, "i").test(log.topic)) {
          continue;
        }
        if (iter([log]).done) {
          break;
        }
      }
      return iter().rows;
    },
    onLoadStart: () => ioc.layoutService.setAppbarLoader(true),
    onLoadEnd: () => ioc.layoutService.setAppbarLoader(false),
    reloadSubject,
  });

  const data$ = useActualValue(data);

  const { execute: handleDownload } = useAsyncAction(async () => {
    const blob = new Blob([JSON.stringify(data$.current, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    ioc.layoutService.downloadFile(url, `logs_${Date.now()}.json`);
  }, {
    onLoadStart: () => ioc.layoutService.setAppbarLoader(true),
    onLoadEnd: () => ioc.layoutService.setAppbarLoader(false),
  });

  const handleAction = async (action: string) => {
    if (action === "download-action") {
      handleDownload();
    }
    if (action === "update-now") {
      await reloadSubject.next();
    }
  }

  return (
    <Container>
      <Breadcrumbs2 items={options} actions={actions} onAction={handleAction} />
       <VirtualView
        sx={{ height: "calc(100vh - 155px)" }}
        withScrollbar
        minHeight={72}
        loading={loading}
        onDataRequest={onSkip}
        bufferSize={CC_LIST_BUFFER_SIZE}
        hasMore={hasMore}
      >
        {data.map((item) => (
          <LogCard
            data={item}
            key={item.id}
            sx={{
              mb: 1,
            }}
          />
        ))}
      </VirtualView>
    </Container>
  );
};

export default LogPage;
