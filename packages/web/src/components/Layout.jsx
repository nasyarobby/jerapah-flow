import { Fragment } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import {
  LuActivity,
  LuArchive,
  LuCode,
  LuDatabase,
  LuFileText,
  LuGitBranch,
  LuHouse,
  LuKey,
  LuLayers,
  LuLogOut,
  LuMenu,
  LuMoon,
  LuServer,
  LuShield,
  LuSun,
  LuTags,
  LuUsers,
} from "react-icons/lu";
import { useLogout, useOpsStatus } from "../api/hooks.js";
import { brandMark } from "../theme/brand.js";
import { useTheme } from "../theme.jsx";

const navSections = [
  {
    items: [{ to: "/", label: "Home", icon: LuHouse, end: true }],
  },
  {
    title: "Automate",
    items: [
      { to: "/workflows", label: "Workflows", icon: LuGitBranch },
      { to: "/scripts", label: "Scripts", icon: LuCode },
      { to: "/profiles", label: "Profiles", icon: LuLayers },
      { to: "/events", label: "Events", icon: LuActivity },
    ],
  },
  {
    title: "Platform",
    items: [
      { to: "/variables", label: "Variables", icon: LuTags },
      { to: "/kv", label: "KV", icon: LuDatabase },
      { to: "/auth", label: "Auth", icon: LuShield },
      { to: "/responses", label: "Responses", icon: LuFileText },
      { to: "/secrets", label: "Secrets", icon: LuKey, admin: true },
    ],
  },
  {
    title: "Admin",
    admin: true,
    items: [
      { to: "/manage", label: "Manage", icon: LuServer },
      { to: "/backup", label: "Backup", icon: LuArchive },
      { to: "/users", label: "Users", icon: LuUsers },
    ],
  },
];

function visibleSections(role) {
  const isAdmin = role === "admin";
  return navSections
    .filter((s) => !s.admin || isAdmin)
    .map((s) => ({
      ...s,
      items: s.items.filter((item) => !item.admin || isAdmin),
    }))
    .filter((s) => s.items.length > 0);
}

export function Layout({ user, children }) {
  const { theme, toggle } = useTheme();
  const logout = useLogout();
  const navigate = useNavigate();
  const ops = useOpsStatus(user.role === "admin");
  const restartNeeded = Boolean(ops.data?.desired?.restartNeeded);

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
          <div className="flex flex-1 items-center gap-2 px-2 text-lg font-semibold">
            <img src={brandMark} alt="" className="size-8 object-contain" />
            JerapahFlow
          </div>
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
        <main className="flex-1 p-4">
          {restartNeeded ? (
            <div className="alert alert-warning mb-4 text-sm">
              <span>
                Config generation changed
                {ops.data?.desired?.restartReason
                  ? ` (${ops.data.desired.restartReason})`
                  : ""}
                .{" "}
                <Link to="/manage" className="link font-medium">
                  Drain restart from Manage
                </Link>{" "}
                to apply on HTTP + workers.
              </span>
            </div>
          ) : null}
          {children}
        </main>
      </div>
      <div className="drawer-side z-20">
        <label htmlFor="nav-drawer" aria-label="Close menu" className="drawer-overlay" />
        <ul className="menu bg-base-200 min-h-full w-64 p-4">
          <li className="mb-2">
            <div className="pointer-events-none flex items-center gap-2">
              <img src={brandMark} alt="" className="size-8 object-contain" />
              <span className="text-base font-semibold text-base-content">JerapahFlow</span>
            </div>
          </li>
          {visibleSections(user.role).map((section) => (
            <Fragment key={section.title ?? "overview"}>
              {section.title ? (
                <li className="menu-title">{section.title}</li>
              ) : null}
              {section.items.map(({ to, label, icon: Icon, end }) => (
                <li key={to}>
                  <NavLink to={to} end={end} onClick={closeDrawer}>
                    <Icon className="size-4" />
                    {label}
                  </NavLink>
                </li>
              ))}
            </Fragment>
          ))}
        </ul>
      </div>
    </div>
  );
}
