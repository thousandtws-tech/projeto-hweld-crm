import { StrictMode } from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { ThemeProvider } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";

import { getRouter } from "./router.tsx";
import { iniciarVitals } from "./lib/vitals";
import { hweldTheme } from "./lib/mui-theme";

const router = getRouter();
iniciarVitals();

const rootElement = document.getElementById("root")!;
if (!rootElement.innerHTML) {
  ReactDOM.createRoot(rootElement).render(
    <StrictMode>
      <ThemeProvider theme={hweldTheme}>
        <CssBaseline />
        <RouterProvider router={router} />
      </ThemeProvider>
    </StrictMode>,
  );
}
