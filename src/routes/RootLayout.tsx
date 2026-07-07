import { useEffect } from "react";
import { NavLink, Outlet } from "react-router";
import { useSession } from "@/state/session";
import { ThemeToggle } from "@/components/ThemeToggle";

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-pill px-4 py-2 text-body font-semibold transition-colors ${
    isActive ? "bg-brand-primary text-[#1A1200]" : "text-text-secondary hover:text-text-primary"
  }`;

export function RootLayout() {
  const init = useSession((s) => s.init);

  useEffect(() => {
    void init();
    // Runs once — init() itself guards against re-subscribing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b border-bg-raised px-6 py-4">
        <span className="font-display text-title text-brand-primary-strong">AadesiPo</span>
        <nav className="flex items-center gap-2">
          <NavLink to="/play" className={navLinkClass}>
            Home
          </NavLink>
          <NavLink to="/profile" className={navLinkClass}>
            Profile
          </NavLink>
          <NavLink to="/settings" className={navLinkClass}>
            Settings
          </NavLink>
          <ThemeToggle />
        </nav>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  );
}
