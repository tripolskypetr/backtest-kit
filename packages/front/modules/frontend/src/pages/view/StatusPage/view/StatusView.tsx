import { Box, Container, Typography } from "@mui/material";
import {
    Breadcrumbs2,
    Breadcrumbs2Type,
    Center,
    IBreadcrumbs2Action,
    IBreadcrumbs2Option,
    IOutletProps,
    One,
    Subject,
    useAsyncValue,
    useOnce,
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

const reloadSubject = new Subject<void>();

export const StatusView = ({ params }: IOutletProps) => {
    const [data, { loading, execute }] = useAsyncValue(
        async () => {
            return await ioc.statusViewService.getStatusOne(params.id);
        },
        {
            onLoadStart: () => ioc.layoutService.setAppbarLoader(true),
            onLoadEnd: () => ioc.layoutService.setAppbarLoader(false),
        },
    );

    useOnce(() => reloadSubject.subscribe(execute));

    const handleBack = async () => {
        const statusList = await ioc.statusViewService.getStatusList();
        if (statusList.length === 1) {
            ioc.routerService.push(`/`);
            return;
        }
        ioc.routerService.push("/status");
    };

    const handleAction = async (action: string) => {
        if (action === "back-action") {
            handleBack();
            ioc.routerService.push("/");
        }
        if (action === "update-now") {
            await reloadSubject.next();
        }
    };

    const renderInner = () => {
        if (loading) {
            return (
                <Center>
                    <Typography variant="h6" sx={{ opacity: 0.5 }}>
                        Loading...
                    </Typography>
                </Center>
            );
        }

        if (!data) {
            return (
                <Center>
                    <Typography variant="h6" sx={{ opacity: 0.5 }}>
                        No pending signal
                    </Typography>
                </Center>
            );
        }

        return (
            <>
                <One
                    handler={data}
                    fields={status_fields}
                />
                <Box paddingBottom="24px" />
            </>
        );
    };

    return (
        <Container>
            <Breadcrumbs2
                items={options}
                actions={actions}
                onAction={handleAction}
            />
            {renderInner()}
            <Background />
        </Container>
    );
};

export default StatusView;
