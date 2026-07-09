import { lazy, Suspense } from "react";
import { BrowserRouter, Route, Routes } from "react-router";
import { ThemeProvider } from "@/theme/ThemeProvider";
import { ToastProvider } from "@/components/Toast";
import { RootLayout } from "@/routes/RootLayout";
import { SiteLayout } from "@/features/site/SiteLayout";
import { GameLayout } from "@/features/site/GameLayout";
import { Landing } from "@/features/site/Landing";
import { Rules } from "@/features/site/Rules";
import { About } from "@/features/site/About";
import { Gallery } from "@/features/site/Gallery";
import { Privacy, Terms } from "@/features/site/Legal";
import { NotFound } from "@/features/site/NotFound";
import { HomeScreen } from "@/features/home/HomeScreen";
import { ProfileScreen } from "@/features/profile/ProfileScreen";
import { DashboardScreen } from "@/features/dashboard/DashboardScreen";
import { LeaderboardsScreen } from "@/features/leaderboards/LeaderboardsScreen";
import { LoginScreen } from "@/features/auth/LoginScreen";
import { ResetScreen } from "@/features/auth/ResetScreen";
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
// Dev-only component reference (design-system showcase), kept at /gallery-dev.
const DevGallery = lazy(() =>
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
            {/* One session boot for the whole app; the two layouts below share
                a single header and design system. */}
            <Route element={<RootLayout />}>
              {/* Browsing pages — premium shell (header + footer), theme-aware,
                  with the app tokens remapped so these adopt the premium look. */}
              <Route element={<SiteLayout />}>
                <Route index element={<Landing />} />
                <Route path="rules" element={<Rules />} />
                <Route path="about" element={<About />} />
                <Route path="gallery" element={<Gallery />} />
                <Route path="privacy" element={<Privacy />} />
                <Route path="terms" element={<Terms />} />
                <Route path="play" element={<HomeScreen />} />
                <Route path="profile" element={<ProfileScreen />} />
                <Route path="dashboard" element={<DashboardScreen />} />
                <Route path="leaderboards" element={<LeaderboardsScreen />} />
                <Route path="login" element={<LoginScreen />} />
                <Route path="reset" element={<ResetScreen />} />
                <Route path="settings" element={<SettingsScreen />} />
                <Route path="*" element={<NotFound />} />
              </Route>
              {/* Gameplay — shared premium header on top, board content left on
                  the Festival theme (reskin is a later step), no footer. */}
              <Route element={<GameLayout />}>
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
                  path="gallery-dev"
                  element={
                    <Suspense fallback={<RouteFallback />}>
                      <DevGallery />
                    </Suspense>
                  }
                />
              </Route>
            </Route>
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </ThemeProvider>
  );
}
