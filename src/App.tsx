import { lazy, Suspense } from "react";
import { BrowserRouter, Route, Routes } from "react-router";
import { ThemeProvider } from "@/theme/ThemeProvider";
import { ToastProvider } from "@/components/Toast";
import { RootLayout } from "@/routes/RootLayout";
import { SiteLayout } from "@/features/site/SiteLayout";
import { Landing } from "@/features/site/Landing";
import { HomeScreen } from "@/features/home/HomeScreen";
import { ProfileScreen } from "@/features/profile/ProfileScreen";
import { SettingsScreen } from "@/features/settings/SettingsScreen";
import { LobbyScreen } from "@/features/lobby/LobbyScreen";
import { JoinRoomScreen } from "@/features/lobby/JoinRoomScreen";

// These three pull in Pixi.js (the single largest dependency) via the
// Board component — code-splitting them means visiting the home screen,
// profile, or settings never downloads the board renderer at all.
const GameScreen = lazy(() =>
  import("@/features/game/GameScreen").then((m) => ({ default: m.GameScreen })),
);
const OnlineGameScreen = lazy(() =>
  import("@/features/game/online/OnlineGameScreen").then((m) => ({
    default: m.OnlineGameScreen,
  })),
);
const Gallery = lazy(() =>
  import("@/features/gallery/Gallery").then((m) => ({ default: m.Gallery })),
);

function RouteFallback() {
  return <div className="p-6 text-center text-body text-text-secondary">Loading…</div>;
}

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <BrowserRouter>
          <Routes>
            {/* Public marketing site — committed dark "Contemporary Indian
                Premium" world, isolated from the in-app theme. */}
            <Route element={<SiteLayout />}>
              <Route index element={<Landing />} />
            </Route>
            {/* In-app chrome. The game setup/home lives at /play now that the
                marketing Landing owns "/". */}
            <Route element={<RootLayout />}>
              <Route path="play" element={<HomeScreen />} />
              <Route path="profile" element={<ProfileScreen />} />
              <Route path="settings" element={<SettingsScreen />} />
              <Route
                path="game/:gameId"
                element={
                  <Suspense fallback={<RouteFallback />}>
                    <GameScreen />
                  </Suspense>
                }
              />
              <Route path="room/:roomId" element={<LobbyScreen />} />
              <Route path="join/:roomCode" element={<JoinRoomScreen />} />
              <Route
                path="online/:roomId"
                element={
                  <Suspense fallback={<RouteFallback />}>
                    <OnlineGameScreen />
                  </Suspense>
                }
              />
              {/* Dev-only component reference, not part of the real nav */}
              <Route
                path="gallery"
                element={
                  <Suspense fallback={<RouteFallback />}>
                    <Gallery />
                  </Suspense>
                }
              />
            </Route>
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </ThemeProvider>
  );
}
