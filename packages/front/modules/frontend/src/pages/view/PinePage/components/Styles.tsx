import { Style } from "react-style-tag";

export const Styles = () => {
    return (
        <Style>
            {`
                #root > .MuiBox-root {
                    padding-left: 0;
                    padding-right: 0;
                }
            `}
        </Style>
    );
};
