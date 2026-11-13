import { StrictMode } from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";

import { getRouter } from "./router.tsx";
import { iniciarVitals } from "./lib/vitals";

const router = getRouter();
iniciarVitals();

const rootElement = document.getElementById("root")!;
if (!rootElement.innerHTML) {
  ReactDOM.createRoot(rootElement).render(
    <StrictMode>
      <RouterProvider router={router} />
    </StrictMode>,
  );
}
