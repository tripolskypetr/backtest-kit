import { Style } from "react-style-tag";

export const Background = () => {
    return (
        <Style>
            {`
                body {
                    background-color: #ddd !important;
                }
            `}
        </Style>
    );
};
