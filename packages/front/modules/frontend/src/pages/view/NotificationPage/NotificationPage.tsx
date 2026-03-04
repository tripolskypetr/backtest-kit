import {
  Breadcrumbs2,
  Breadcrumbs2Type,
  IBreadcrumbs2Action,
  IBreadcrumbs2Option,
  pickDocuments,
  Subject,
  useOffsetPaginator,
  VirtualView,
} from "react-declarative";
import IconWrapper from "../../../components/common/IconWrapper";
import { Download, KeyboardArrowLeft, Refresh } from "@mui/icons-material";
import { Container } from "@mui/material";
import ioc from "../../../lib";
import { NotificationModel } from "backtest-kit";
import { CC_LIST_BUFFER_SIZE } from "../../../config/params";
import NotificationCard from "./components/NotificationCard";

const actions: IBreadcrumbs2Action[] = [
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
    label: "Notifications",
  },
];

const reloadSubject = new Subject<void>();

export const NotificationPage = () => {

  const { data, hasMore, loading, onSkip } = useOffsetPaginator({
    handler: async (limit, offset) => {
      const notificationList = await ioc.notificationViewService.getList();
      const iter = pickDocuments<NotificationModel>(limit, offset);
      for (const notification of notificationList) {
        if (iter([notification]).done) {
          break;
        }
      }
      return iter().rows;
    },
    onLoadStart: () => ioc.layoutService.setAppbarLoader(true),
    onLoadEnd: () => ioc.layoutService.setAppbarLoader(false),
    reloadSubject,
  });

  const handleAction = async (action: string) => {
    if (action === "back-action") {
      ioc.routerService.push("/");
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
          <NotificationCard
            item={item}
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

export default NotificationPage;
