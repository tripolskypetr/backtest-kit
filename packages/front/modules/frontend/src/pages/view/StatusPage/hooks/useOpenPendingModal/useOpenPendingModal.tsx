import {
  Subject,
  TSubject,
  useModalManager,
  useWizardModal,
} from "react-declarative";
import { createMemoryHistory } from "history";
import routes from "./routes";
import steps from "./steps";
import { IconButton, Stack } from "@mui/material";
import { Close } from "@mui/icons-material";
import { CC_FULLSCREEN_SIZE_REQUEST } from "../../../../../config/params";

const DEFAULT_PATH = "/brief";

const history = createMemoryHistory();

export interface IOpenPendingPayload {
  symbol: string;
  strategyName: string;
  exchangeName: string;
}

interface IParams {
  payload: {
    getContext: () => IOpenPendingPayload;
    reloadSubject: TSubject<void>;
  };
}

export const useOpenPendingModal = ({ payload }: IParams) => {
  const { pickData, render } = useWizardModal({
    history,
    animation: "none",
    title: "Открыть позицию",
    AfterTitle: ({ onClose }) => (
      <Stack direction="row" gap={1}>
        <IconButton size="small" onClick={onClose}>
          <Close />
        </IconButton>
      </Stack>
    ),
    mapPayload: () => payload,
    pathname: DEFAULT_PATH,
    sizeRequest: CC_FULLSCREEN_SIZE_REQUEST,
    routes,
    steps,
    onSubmit: async (data) => {
      if (data) {
        await payload.reloadSubject.next();
      }
      return true;
    },
  });

  return {
    pickData: () => {
      history.push(DEFAULT_PATH);
      pickData();
    },
    render,
  }
};

export default useOpenPendingModal;
