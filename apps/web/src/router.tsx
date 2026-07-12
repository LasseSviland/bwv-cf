import { Route, Routes } from "react-router-dom";
import { AppShell } from "./layout/AppShell";
import { HomePage } from "./pages/HomePage";
import { MonopoliesPage } from "./pages/MonopoliesPage";
import { MonopolyDetailPage } from "./pages/MonopolyDetailPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { StatusPage } from "./pages/StatusPage";
import { WineDetailPage } from "./pages/WineDetailPage";
import { WineMonopolyPage } from "./pages/WineMonopolyPage";
import { WinesPage } from "./pages/WinesPage";

export const AppRoutes = () => (
  <Routes>
    <Route element={<AppShell />}>
      <Route index element={<HomePage />} />
      <Route path="wines" element={<WinesPage />} />
      <Route path="wines/:wineId" element={<WineDetailPage />} />
      <Route path="wines/:wineId/monopolies/:monopolyId" element={<WineMonopolyPage />} />
      <Route path="monopolies" element={<MonopoliesPage />} />
      <Route path="monopolies/:monopolyId" element={<MonopolyDetailPage />} />
      <Route path="status" element={<StatusPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Route>
  </Routes>
);
