import { createTheme } from "@mui/material/styles";

/**
 * Tema MUI — paleta HWeld (espelha os tokens de styles.css).
 * primary navy #26488C, danger #D92546, warn pink #D9486E, sky #A0C4F2.
 */
export const hweldTheme = createTheme({
  palette: {
    primary: { main: "#26488c", contrastText: "#ffffff" },
    secondary: { main: "#88abf2" },
    error: { main: "#d92546" },
    warning: { main: "#d9486e" },
    info: { main: "#26488c" },
    success: { main: "#26488c" },
    background: { default: "#f2f2f2", paper: "#ffffff" },
    text: { primary: "#272728", secondary: "#5f6368" },
  },
  shape: { borderRadius: 8 },
  typography: {
    fontFamily:
      '"Inter", "Segoe UI", system-ui, -apple-system, Roboto, "Helvetica Neue", Arial, sans-serif',
    button: { textTransform: "none", fontWeight: 600 },
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: { borderRadius: 8, boxShadow: "none" },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: { fontWeight: 500, borderRadius: 6 },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: { borderRadius: 8, backgroundColor: "#fff" },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        head: {
          fontSize: 12,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.04em",
          color: "#5f6368",
        },
      },
    },
  },
});
