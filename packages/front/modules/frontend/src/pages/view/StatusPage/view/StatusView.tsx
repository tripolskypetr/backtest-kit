import { Container } from "@mui/material";
import {
    Breadcrumbs2,
    Breadcrumbs2Type,
    IBreadcrumbs2Action,
    IBreadcrumbs2Option,
    IOutletProps,
    One,
} from "react-declarative";
import { status_fields } from "../../../../assets/status_fields";
import { KeyboardArrowLeft, Refresh } from "@mui/icons-material";
import IconWrapper from "../../../../components/common/IconWrapper";
import ioc from "../../../../lib";
import { Background } from "../../../../components/common/Background";

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
        label: "Status",
    },
];

const actions: IBreadcrumbs2Action[] = [
    {
        action: "update-now",
        label: "Refresh",
        icon: () => <IconWrapper icon={Refresh} color="#4caf50" />,
    },
];

export const StatusView = ({ params }: IOutletProps) => {
    const handleBack = async () => {
        const statusList = await ioc.statusViewService.getStatusList();
        if (statusList.length === 1) {
            ioc.routerService.push(`/`);
            return;
        }
        ioc.routerService.push("/status");
    };

    const handleAction = (action: string) => {
        if (action === "back-action") {
            handleBack();
            ioc.routerService.push("/");
        }
    };

    return (
        <Container>
            <Breadcrumbs2
                items={options}
                actions={actions}
                onAction={handleAction}
            />
            <One
                handler={() => ({
                    indicatorValues: {
                        newChats: 21,
                        newSales: 5,
                        hoursWorked: 10,
                        lateArrivals: 9,
                        abscenceHours: 17,
                        overtime: 30,
                        downTime: 13,
                    },
                })}
                fields={status_fields}
            />
            <Background />
        </Container>
    );
};

export default StatusView;
