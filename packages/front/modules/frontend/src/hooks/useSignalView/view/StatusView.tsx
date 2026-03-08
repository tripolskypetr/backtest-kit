import { IOutletModalProps, One, ScrollView } from "react-declarative";
import { Box } from "@mui/material";
import { defaultSlots } from "../../../components/OneSlotFactory";
import status_fields from "../../../assets/status_fields";

export const StatusView = ({ data }: IOutletModalProps) => {
    return (
        <Box sx={{ height: "100%", width: "100%", pt: 1 }}>
            <ScrollView withScrollbar hideOverflowX sx={{ height: "100%" }}>
                <div>
                    <One
                        slots={defaultSlots}
                        fields={status_fields}
                        sx={{ pr: 2 }}
                        payload={() => ({ outlinePaper: true })}
                        handler={() => data}
                    />
                    <Box sx={{ paddingBottom: "65px" }} />
                </div>
            </ScrollView>
        </Box>
    );
};

export default StatusView;
