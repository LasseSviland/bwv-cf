import { QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { queryClient } from "./api/queryClient";
import { AuthProvider } from "./auth/AuthProvider";
import { PasswordGate } from "./auth/PasswordGate";
import { AppRoutes } from "./router";
import "./styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <PasswordGate>
          <BrowserRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
            <AppRoutes />
          </BrowserRouter>
        </PasswordGate>
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
);
