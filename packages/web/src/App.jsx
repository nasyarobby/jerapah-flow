import { useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useBootstrap, useMe } from "./api/hooks.js";
import { Layout } from "./components/Layout.jsx";
import { AuthPage } from "./pages/AuthPage.jsx";
import { HomePage } from "./pages/HomePage.jsx";
import { ScriptsPage } from "./pages/ScriptsPage.jsx";
import { ScriptDryRunPage } from "./pages/ScriptDryRunPage.jsx";
import { ScriptEditPage, ScriptNewPage } from "./pages/ScriptEditPage.jsx";
import { WorkflowsPage } from "./pages/WorkflowsPage.jsx";
import { WorkflowEditPage, WorkflowNewPage } from "./pages/WorkflowEditPage.jsx";
import { EventsPage } from "./pages/EventsPage.jsx";
import { EventDetailPage } from "./pages/EventDetailPage.jsx";
import { UsersPage } from "./pages/UsersPage.jsx";

export function App() {
  const qc = useQueryClient();
  const bootstrap = useBootstrap();
  const me = useMe();

  useEffect(() => {
    function onUnauthorized() {
      qc.setQueryData(["me"], null);
    }
    window.addEventListener("scrunner:unauthorized", onUnauthorized);
    return () => window.removeEventListener("scrunner:unauthorized", onUnauthorized);
  }, [qc]);

  const user = me.data?.user;
  const loading =
    bootstrap.isLoading || (me.isLoading && !me.isError && me.data === undefined);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <span className="loading loading-spinner loading-lg" />
      </div>
    );
  }

  if (!user) {
    return <AuthPage needsSetup={Boolean(bootstrap.data?.needsSetup)} />;
  }

  return (
    <Layout user={user}>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/scripts" element={<ScriptsPage />} />
        <Route path="/scripts/new" element={<ScriptNewPage />} />
        <Route path="/scripts/:name/dry-run" element={<ScriptDryRunPage />} />
        <Route path="/scripts/:name/edit" element={<ScriptEditPage />} />
        <Route path="/workflows" element={<WorkflowsPage />} />
        <Route path="/workflows/new" element={<WorkflowNewPage />} />
        <Route path="/workflows/:owner/:file/edit" element={<WorkflowEditPage />} />
        <Route path="/events" element={<EventsPage />} />
        <Route path="/events/:id" element={<EventDetailPage />} />
        {user.role === "admin" ? (
          <Route path="/users" element={<UsersPage />} />
        ) : (
          <Route path="/users" element={<Navigate to="/" replace />} />
        )}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
