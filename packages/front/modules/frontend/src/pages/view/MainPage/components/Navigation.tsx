import {
    Breadcrumbs2,
    Breadcrumbs2Type,
    IBreadcrumbs2Option,
    IBreadcrumbs2Action,
} from "react-declarative";
import actionSubject from "../config/actionSubject";
import {
    Refresh,
} from "@mui/icons-material";
import IconWrapper from "../../../../components/common/IconWrapper";

const options: IBreadcrumbs2Option[] = [
    {
        type: Breadcrumbs2Type.Link,
        action: "back-action",
        label: "Main",
    },
    {
        type: Breadcrumbs2Type.Link,
        action: "back-action",
        label: "Dashboard",
    },
];

const actions: IBreadcrumbs2Action[] = [
    {
        action: "update-now",
        label: "refresh",
        icon: () => <IconWrapper icon={Refresh} color="#4caf50" />,
    },
];

export const Navigation = () => (
    <Breadcrumbs2
        items={options}
        actions={actions}
        onAction={actionSubject.next}
    />
);

export default Navigation;
