import { lazy, Suspense, type ComponentType } from "react";
import { Route, Routes } from "react-router-dom";
import { AppShell } from "./layout/AppShell";

const HomePage = lazy(() =>
  import("./pages/HomePage").then(({ HomePage }) => ({ default: HomePage })),
);
const WinesPage = lazy(() =>
  import("./pages/WinesPage").then(({ WinesPage }) => ({ default: WinesPage })),
);
const WineDetailPage = lazy(() =>
  import("./pages/WineDetailPage").then(({ WineDetailPage }) => ({ default: WineDetailPage })),
);
const MonopoliesPage = lazy(() =>
  import("./pages/MonopoliesPage").then(({ MonopoliesPage }) => ({ default: MonopoliesPage })),
);
const MonopolyDetailPage = lazy(() =>
  import("./pages/MonopolyDetailPage").then(({ MonopolyDetailPage }) => ({
    default: MonopolyDetailPage,
  })),
);
const SettingsPage = lazy(() =>
  import("./pages/SettingsPage").then(({ SettingsPage }) => ({ default: SettingsPage })),
);
const NotFoundPage = lazy(() =>
  import("./pages/NotFoundPage").then(({ NotFoundPage }) => ({ default: NotFoundPage })),
);

const PageFallback = () => (
  <div
    className="flex min-h-48 items-center justify-center gap-3 text-sm text-muted-foreground"
    role="status"
  >
    <span
      className="size-4 animate-spin rounded-full border-2 border-current border-r-transparent"
      aria-hidden="true"
    />
    Loading page…
  </div>
);

const page = (Page: ComponentType) => (
  <Suspense fallback={<PageFallback />}>
    <Page />
  </Suspense>
);

export const AppRoutes = () => (
  <Routes>
    <Route element={<AppShell />}>
      <Route index element={page(HomePage)} />
      <Route path="wines" element={page(WinesPage)} />
      <Route path="wines/:wineId" element={page(WineDetailPage)} />
      <Route path="monopolies" element={page(MonopoliesPage)} />
      <Route path="monopolies/:monopolyId" element={page(MonopolyDetailPage)} />
      <Route path="settings" element={page(SettingsPage)} />
      <Route path="*" element={page(NotFoundPage)} />
    </Route>
  </Routes>
);
