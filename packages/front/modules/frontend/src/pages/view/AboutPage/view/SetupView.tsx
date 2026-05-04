import {
  TypedField,
  FieldType,
  useAsyncValue,
  Breadcrumbs2Type,
  IBreadcrumbs2Option,
  Breadcrumbs2,
  IBreadcrumbs2Action,
  Subject,
  useOnce,
} from "react-declarative";

import {
  Container,
} from "@mui/material";
import { One } from "react-declarative";
import { KeyboardArrowLeft, Refresh } from "@mui/icons-material";
import ioc from "../../../../lib";
import IconWrapper from "../../../../components/common/IconWrapper";
import { setup_fields } from "../../../../assets/setup_fields";

interface IBackendData {
    broker_enabled: boolean;
    dump_enabled: boolean;
    markdown_enabled: boolean;
    memory_enabled: boolean;
    notification_enabled: boolean;
    recent_enabled: boolean;
    report_enabled: boolean;
    running_mode: "backtest" | "live" | "none"
    state_enabled: boolean;
    storage_enabled: boolean;
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
    label: "Dashboard",
  },
  {
    type: Breadcrumbs2Type.Link,
    action: "back-action",
    label: "Performance",
  },
  {
    type: Breadcrumbs2Type.Link,
    action: "back-action",
    label: "Settings",
  },
  {
    type: Breadcrumbs2Type.Button,
    action: "update-now",
    label: "Refresh",
    icon: Refresh,
  },
];

const actions: IBreadcrumbs2Action[] = [
    {
        action: "update-now",
        label: "Refresh",
        icon: () => <IconWrapper icon={Refresh} color="#4caf50" />,
    },
];

const reloadSubject = new Subject<void>();

const handleReload = async () => {
  {
    ioc.setupViewService.getSetupData.clear();
  }
  await reloadSubject.next();
};

export const SetupView = () => {

  const [data, { execute: executeData, loading: loadingData }] = useAsyncValue(
    async () => {
      const data = await ioc.setupViewService.getSetupData();
      return data;
    },
    {
      onLoadStart: () => ioc.layoutService.setAppbarLoader(true),
      onLoadEnd: () => ioc.layoutService.setAppbarLoader(false),
    }
  );

  useOnce(() => reloadSubject.subscribe(executeData));

  const handleAction = async (action: string) => {
    if (action === "back-action") {
      ioc.routerService.push("/about")
    }
    if (action === "update-now") {
      await handleReload();
    }
  };

  const renderInner = () => {
    if (!data) {
      return null;
    }
    if (loadingData) {
      return null;
    }
    return (
      <One<IBackendData>
        readonly
        handler={data}
        fields={setup_fields}
      />
    )
  }


  return (
    <Container>
      <Breadcrumbs2 items={options} actions={actions} onAction={handleAction} />
      {renderInner()}
    </Container>
  );
};

export default SetupView;
