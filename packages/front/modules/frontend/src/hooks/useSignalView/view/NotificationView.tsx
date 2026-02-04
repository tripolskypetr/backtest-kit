import { Box } from "@mui/material";
import { AutoSizer, IOutletModalProps, VirtualView } from "react-declarative";
import NotificationCard from "../components/NotificationCard";

export const NotificationView = ({ data }: IOutletModalProps) => {



    return (
        <Box sx={{ height: "100%", width: "100%", pt: 1 }}>
            <AutoSizer payload={data}>
                {(size) => (
                    <VirtualView
                        sx={{ height: size.height }}
                        withScrollbar
                        minHeight={72}
                        bufferSize={25}
                    >
                        {data.map((item) => (
                            <NotificationCard
                                sx={{
                                    maxWidth: Math.max(size.width - 16, 0),
                                    mb: 1,
                                }}
                                key={item.$id}
                                item={item}
                            />
                        ))}
                    </VirtualView>
                )}
            </AutoSizer>
        </Box>
    );
};

export default NotificationView;
