import { useState } from "react";
import { LuLogIn, LuUserPlus } from "react-icons/lu";
import { errorMessage } from "../api/client.js";
import { useLogin, useRegister } from "../api/hooks.js";
import { brandBanner } from "../theme/brand.js";

export function AuthPage({ needsSetup }) {
  const login = useLogin();
  const register = useRegister();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const mutation = needsSetup ? register : login;
  const error = mutation.isError ? errorMessage(mutation.error) : null;

  function onSubmit(e) {
    e.preventDefault();
    mutation.mutate({ username, password });
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-base-200">
      <form
        onSubmit={onSubmit}
        className="fieldset bg-base-100 border-base-300 rounded-box w-full max-w-sm border p-6 gap-3"
      >
        <legend className="fieldset-legend text-lg">
          {needsSetup ? "Create admin" : "Sign in"}
        </legend>
        <img
          src={brandBanner}
          alt="JerapahFlow"
          className="mb-2 w-full rounded-box bg-neutral object-contain"
        />
        <label className="label" htmlFor="username">
          Username
        </label>
        <input
          id="username"
          className="input w-full"
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
        />
        <label className="label" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          type="password"
          className="input w-full"
          autoComplete={needsSetup ? "new-password" : "current-password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
        />
        {error ? <p className="text-error text-sm">{error}</p> : null}
        <button
          type="submit"
          className="btn btn-primary mt-2"
          disabled={mutation.isPending}
        >
          {needsSetup ? <LuUserPlus className="size-4" /> : <LuLogIn className="size-4" />}
          {needsSetup ? "Create" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
