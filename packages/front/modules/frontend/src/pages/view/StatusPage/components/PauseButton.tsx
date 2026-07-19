import { Pause, PlayArrow } from "@mui/icons-material";
import {
    ActionButton,
    Center,
    queued,
    sleep,
    useAsyncValue,
    useOnce,
} from "react-declarative";
import ioc from "../../../../lib";
import { reloadSubject } from "../../../../config/emitters";
import { t } from "../../../../i18n";
import Tooltip from "../../../../components/common/Tooltip";

interface IPauseButtonProps {
    payload: {
        symbol: string;
        strategyName: string;
        exchangeName: string;
    };
}

const togglePause = queued(
    async (dto: {
        symbol: string;
        strategyName: string;
        exchangeName: string;
    }) => {
        const paused = await ioc.pauseViewService.getPaused(dto.symbol, dto);
        const newPaused = !paused;
        await ioc.pauseViewService.setPaused(dto.symbol, dto, newPaused);
        await sleep(1_000);
        ioc.alertService.notify(newPaused ? t("Now is paused") : t("Now is active"));
        await reloadSubject.next();
    },
);

export const PauseButton = ({ payload }: IPauseButtonProps) => {
    const [paused, { loading, execute }] = useAsyncValue(
        async () => {
            return await ioc.pauseViewService.getPaused(
                payload.symbol,
                payload,
            );
        },
        {
            onLoadStart: () => ioc.layoutService.setAppbarLoader(true),
            onLoadEnd: () => ioc.layoutService.setAppbarLoader(false),
        },
    );

    useOnce(() => reloadSubject.subscribe(execute));

    const getLabel = () => {
        if (paused) {
            return t("Right now is paused");
        }
        return t("Right now is running");
    };

    return (
        <Tooltip placement="bottom" description={getLabel()}>
            <ActionButton
                variant="outlined"
                disabled={loading}
                onClick={async () => void (await togglePause(payload))}
            >
                <Center>{paused ? <PlayArrow /> : <Pause />}</Center>
            </ActionButton>
        </Tooltip>
    );
};

export default PauseButton;
