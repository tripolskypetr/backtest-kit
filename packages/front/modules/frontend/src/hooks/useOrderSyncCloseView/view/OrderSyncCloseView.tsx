import { IOutletModalProps, One, ScrollView } from "react-declarative";
import { Box } from "@mui/material";
import { defaultSlots } from "../../../components/OneSlotFactory";
import order_sync_close_fields from "../../../assets/order_sync_close_fields";

export const OrderSyncCloseView = ({ data }: IOutletModalProps) => {
  return (
    <Box sx={{ height: "100%", width: "100%", pt: 1 }}>
      <ScrollView withScrollbar hideOverflowX sx={{ height: "100%" }}>
        <div>
          <One slots={defaultSlots} fields={order_sync_close_fields} handler={() => data} />
          <Box sx={{ paddingBottom: "65px" }} />
        </div>
      </ScrollView>
    </Box>
  );
};

export default OrderSyncCloseView;
