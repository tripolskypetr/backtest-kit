import { createTheme } from "@mui/material";
import {
  lightBackground,
  lightError,
  lightInfo,
  lightPrimary,
  lightSecondary,
  lightSuccess,
  lightText,
  lightWarning,
} from "./colors";

export const BREAKPOINTS = {
  xs: 0,
  sm: 800,
  md: 1100,
  lg: 1300,
  xl: 1736,
};

export const muiTheme = createTheme({
  breakpoints: {
    values: BREAKPOINTS,
  },
  palette: {
    mode: "light",
    primary: {
      main: lightPrimary.main,
    },
    secondary: {
      main: lightSecondary.main,
    },
    warning: {
      main: lightWarning.main,
    },
    info: {
      main: lightInfo.main,
    },
    success: {
      main: lightSuccess.main,
    },
    error: {
      main: lightError.main,
    },
    text: {
      primary: lightText.primary,
      secondary: lightText.secondary,
      disabled: lightText.disabled,
    },
    background: {
      default: "#E8E9ED !important",
      paper: "#fff",
    },
  },
  shape: {
    borderRadius: 12, // Rounded corners to match MD3
  },
  shadows: [
    'none', // Level 0
    '0px 1px 2px rgba(0, 0, 0, 0.1)', // Level 1
    '0px 2px 4px rgba(0, 0, 0, 0.1)', // Level 2
    '0px 3px 6px rgba(0, 0, 0, 0.2)', // Level 3
    '0px 4px 8px rgba(0, 0, 0, 0.2)', // Level 4
    '0px 5px 10px rgba(0, 0, 0, 0.3)', // Level 5
    '0px 6px 12px rgba(0, 0, 0, 0.3)', // Level 6
    '0px 7px 14px rgba(0, 0, 0, 0.4)', // Level 7
    '0px 8px 16px rgba(0, 0, 0, 0.4)', // Level 8
    '0px 9px 18px rgba(0, 0, 0, 0.5)', // Level 9
    '0px 10px 20px rgba(0, 0, 0, 0.5)', // Level 10
    '0px 11px 22px rgba(0, 0, 0, 0.6)', // Level 11
    '0px 12px 24px rgba(0, 0, 0, 0.6)', // Level 12
    '0px 13px 26px rgba(0, 0, 0, 0.7)', // Level 13
    '0px 14px 28px rgba(0, 0, 0, 0.7)', // Level 14
    '0px 15px 30px rgba(0, 0, 0, 0.8)', // Level 15
    '0px 16px 32px rgba(0, 0, 0, 0.8)', // Level 16
    '0px 17px 34px rgba(0, 0, 0, 0.9)', // Level 17
    '0px 18px 36px rgba(0, 0, 0, 0.9)', // Level 18
    '0px 19px 38px rgba(0, 0, 0, 1)',   // Level 19
    '0px 20px 40px rgba(0, 0, 0, 1)',   // Level 20
    '0px 21px 42px rgba(0, 0, 0, 1)',   // Level 21
    '0px 22px 44px rgba(0, 0, 0, 1)',   // Level 22
    '0px 23px 46px rgba(0, 0, 0, 1)',   // Level 23
    '0px 24px 48px rgba(0, 0, 0, 1)',   // Level 24
  ],
  components: {
    MuiModal: {
      styleOverrides: {
        // @ts-ignore
        backdrop: {
          backgroundColor: 'rgba(0, 0, 0, 0.5)', // Semi-transparent backdrop per MD3
          backdropFilter: 'blur(4px)', // Subtle blur for modern MD3 look
        },
      },
    },
    MuiPaper: {
      defaultProps: {
        elevation: 3, // Default elevation to match MD3 paper elevation
      },
      styleOverrides: {
        root: {
          borderRadius: '12px', // Round corners
          backgroundColor: '#ffffff', // White background for paper
          boxShadow: '0px 4px 6px rgba(0, 0, 0, 0.1)', // Subtle shadow for MD3
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          background: lightBackground.muiAppBar,
        },
      },
    },
    MuiTab: {
      styleOverrides: {
        fullWidth: {
          background: lightBackground.muiTab,
          color: "white !important",
          fontWeight: "bold",
        },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          borderRadius: 6,
          padding: 8,
        },
        sizeSmall: {
          padding: 4,
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        contained: {
          background: lightPrimary.main,
          "&:hover": {
            background: lightPrimary.light,
          },
        },
      },
    },
    MuiBadge: {
      styleOverrides: {
        badge: {
          background: "#2e41a9",
        },
      },
    },
    MuiSnackbar: {
      styleOverrides: {
        root: {
          border: "1px solid black",
          borderRadius: "4px",
          boxShadow: "0 0 5px 2px grey",
          "& > *": {
            color: "black !important",
          },
        },
      },
    },
  },
});

export default muiTheme;
