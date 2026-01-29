import React from "react";

import { useMemo } from "react";

import { alpha, Box, lighten } from "@mui/material";

interface IIconWrapperProps {
    color: string;
    icon: React.ComponentType<any>;
}

export const IconWrapper = ({
    icon: Icon,
    color,
}: IIconWrapperProps) => {

    const background = useMemo(() => {
        return alpha(lighten(color, 0.5), 0.42);
    }, [color]);

    return (
        <Box
            sx={{
                background,
                padding: '6px',
                marginTop: '6px',
                marginBottom: '6px',
                marginLeft: '-2px',
                marginRight: '12px',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
            }}
        >
            <Icon sx={{ color }} />
        </Box>
    );
}

export default IconWrapper;
