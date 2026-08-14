import { NavLink, useNavigate } from "react-router-dom";
import {
  LuActivity,
  LuCode,
  LuDatabase,
  LuFileText,
  LuGitBranch,
  LuHouse,
  LuKey,
  LuLogOut,
  LuMenu,
  LuMoon,
  LuShield,
  LuSun,
  LuUsers,
} from "react-icons/lu";
import { useLogout } from "../api/hooks.js";
import { useTheme } from "../theme.jsx";

const links = [
  { to: "/", label: "Home", icon: LuHouse, end: true },
  { to: "/scripts", label: "Scripts", icon: LuCode },
  { to: "/workflows", label: "Workflows", icon: LuGitBranch },
  { to: "/events", label: "Events", icon: LuActivity },
  { to: "/kv", label: "KV", icon: LuDatabase },
  { to: "/auth", label: "Auth", icon: LuShield },
  { to: "/responses", label: "Responses", icon: LuFileText },
];

export function Layout({ user, children }) {
  const { theme, toggle } = useTheme();
  const logout = useLogout();
  const navigate = useNavigate();

  const navItems = [
    ...links,
    ...(user.role === "admin"
      ? [
          { to: "/secrets", label: "Secrets", icon: LuKey },
          { to: "/users", label: "Users", icon: LuUsers },
        ]
      : []),
  ];

  function closeDrawer() {
    const el = document.getElementById("nav-drawer");
    if (el) el.checked = false;
  }

  return (
    <div className="drawer lg:drawer-open">
      <input id="nav-drawer" type="checkbox" className="drawer-toggle" />
      <div className="drawer-content flex min-h-screen flex-col">
        <div className="navbar bg-base-100 border-base-300 sticky top-0 z-10 border-b">
          <div className="flex-none lg:hidden">
            <label htmlFor="nav-drawer" className="btn btn-square btn-ghost" aria-label="Open menu">
              <LuMenu className="size-5" />
            </label>
          </div>
          <div className="flex-1 px-2 text-lg font-semibold">scrunner</div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="btn btn-ghost btn-square"
              onClick={toggle}
              title={theme === "dark" ? "Light" : "Dark"}
              aria-label="Toggle theme"
            >
              {theme === "dark" ? <LuSun className="size-5" /> : <LuMoon className="size-5" />}
            </button>
            <span className="hidden sm:inline text-sm opacity-70 px-2">{user.username}</span>
            <button
              type="button"
              className="btn btn-ghost btn-square"
              title="Log out"
              aria-label="Log out"
              onClick={() =>
                logout.mutate(undefined, { onSuccess: () => navigate("/") })
              }
            >
              <LuLogOut className="size-5" />
            </button>
          </div>
        </div>
        <main className="flex-1 p-4">{children}</main>
      </div>
      <div className="drawer-side z-20">
        <label htmlFor="nav-drawer" aria-label="Close menu" className="drawer-overlay" />
        <ul className="menu bg-base-200 min-h-full w-64 p-4">
          <li className="menu-title">scrunner</li>
          {navItems.map(({ to, label, icon: Icon, end }) => (
            <li key={to}>
              <NavLink to={to} end={end} onClick={closeDrawer}>
                <Icon className="size-4" />
                {label}
              </NavLink>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
