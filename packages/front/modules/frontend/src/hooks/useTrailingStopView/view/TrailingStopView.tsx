import { IOutletModalProps, One, ScrollView } from "react-declarative";
import { Box } from "@mui/material";
import { defaultSlots } from "../../../components/OneSlotFactory";
import trailing_stop_fields from "../../../assets/trailing_stop_fields";

export const TrailingStopView = ({ data }: IOutletModalProps) => {
  return (
    <Box sx={{ height: "100%", width: "100%", pt: 1 }}>
      <ScrollView withScrollbar hideOverflowX sx={{ height: "100%" }}>
        <div>
          <One slots={defaultSlots} fields={trailing_stop_fields} handler={() => data} />
          <Box sx={{ paddingBottom: "65px" }} />
        </div>
      </ScrollView>
    </Box>
  );
};

export default TrailingStopView;
