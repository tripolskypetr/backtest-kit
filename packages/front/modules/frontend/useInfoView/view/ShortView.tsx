import { IOutletModalProps, ScrollView } from "react-declarative";
import { Box } from "@mui/material";
import Markdown from "../../../components/common/Markdown";
import InfoButton from "../../../components/common/InfoButton";

export const ShortView = ({ data }: IOutletModalProps) => {
    return (
        <Box sx={{ height: "100%", width: "100%", pt: 1 }}>
            <ScrollView withScrollbar hideOverflowX sx={{ height: "100%" }}>
                <div>
                    <Markdown content={data?.content || "# Нет данных"} />
                    <InfoButton info={data?.info} />
                    <Box sx={{ paddingBottom: "65px" }} />
                </div>
            </ScrollView>
        </Box>
    );
};

export default ShortView;
