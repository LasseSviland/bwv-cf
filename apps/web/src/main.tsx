import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "./auth/AuthProvider";
import { PasswordGate } from "./auth/PasswordGate";
import { TooltipProvider } from "./components/ui/tooltip";
import { AppRoutes } from "./router";
import "./styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");

createRoot(root).render(
  <StrictMode>
    <AuthProvider>
      <TooltipProvider>
        <PasswordGate>
          <BrowserRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
            <AppRoutes />
          </BrowserRouter>
        </PasswordGate>
      </TooltipProvider>
    </AuthProvider>
  </StrictMode>,
);
