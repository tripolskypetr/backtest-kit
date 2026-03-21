import MatTooltip from "@mui/material/Tooltip";
import { useMemo } from "react";
import { useMediaContext } from "react-declarative";

interface ITooltipProps {
    description: string;
    children: React.ReactElement;
}

export const Tooltip = ({ description, children }: ITooltipProps) => {
    const { isDesktop } = useMediaContext();

    const slotProps = useMemo(
        () => ({
            popper: {
                sx: { pointerEvents: "none" },
                modifiers: isDesktop
                    ? [
                          {
                              name: "fallbackPlacements",
                              options: {
                                  fallbackPlacements: [
                                      "right",
                                      "top",
                                      "bottom",
                                  ],
                              },
                          },
                      ]
                    : undefined,
            },
            tooltip: { sx: { background: "black" } },
            arrow: { sx: { color: "black" } },
        }),
        [isDesktop],
    );

    const props = useMemo(() => ({
        placement: isDesktop ? "left" as const : undefined,
    }), [isDesktop]);

    return (
        <MatTooltip
            title={description}
            slotProps={slotProps}
            {...props}
            arrow
        >
            {children}
        </MatTooltip>
    );
};

export default Tooltip;
