"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import type { DownstreamClient } from "@/lib/bridge/config";

interface AuthorizationDetails {
  client_name: string;
  client_uri?: string;
  client_logo_uri?: string;
  scopes: string[];
}

type Status =
  | "loading"
  | "ready"
  | "confirm" // already approved before — ask "continue as X?" instead of auto-redirecting
  | "approving"
  | "denying"
  | "switching"
  | "done"
  | "error";

export function ConsentForm({
  authorizationId,
  userEmail,
  downstream,
  switchAccountUrl,
}: {
  authorizationId: string;
  userEmail: string;
  downstream?: DownstreamClient;
  /** The requesting app's /login — restarts sign-in after switching account. */
  switchAccountUrl?: string;
}) {
  const [details, setDetails] = useState<AuthorizationDetails | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState<string | null>(null);
  const [pendingRedirect, setPendingRedirect] = useState<string | null>(null);

  // Downstream registry wins over whatever Supabase has registered for the
  // single bridge OAuth client — that's how each first-party app shows its
  // own identity on the shared consent screen.
  const displayName = downstream?.name ?? details?.client_name;
  const displayLogo = downstream?.logoUri ?? details?.client_logo_uri;

  useEffect(() => {
    async function fetchDetails() {
      try {
        const supabase = createClient();
        const { data, error } =
          await supabase.auth.oauth.getAuthorizationDetails(authorizationId);

        if (error) {
          setError(error.message ?? "Failed to fetch authorization details.");
          setStatus("error");
          return;
        }

        const d = data as Record<string, any>;

        // Already consented: Supabase auto-approves and returns redirect_url.
        // Don't follow it silently — on a shared device the remembered session
        // may be someone else's. Ask "continue as X?" first.
        if (d.redirect_url) {
          setPendingRedirect(d.redirect_url);
          setStatus("confirm");
          return;
        }

        // Supabase OAuth SDK returns: { client: { name, uri, logo_uri }, scope: "a b c" }
        // Older/loose shapes are still accepted as fallbacks.
        const client = d.client ?? {};
        const scopeStr: string | undefined = d.scope ?? d.scopes;
        setDetails({
          client_name:
            client.name ?? d.client_name ?? d.application?.name ?? "this application",
          client_uri: client.uri,
          client_logo_uri: client.logo_uri,
          scopes: scopeStr
            ? scopeStr.split(" ").filter(Boolean)
            : d.requested_scopes ?? [],
        });
        setStatus("ready");
      } catch (err: any) {
        setError(err.message ?? "An unexpected error occurred.");
        setStatus("error");
      }
    }

    fetchDetails();
  }, [authorizationId]);

  async function handleApprove() {
    setStatus("approving");
    try {
      const supabase = createClient();
      const { data, error } =
        await supabase.auth.oauth.approveAuthorization(authorizationId);
      if (error) {
        setError(error.message ?? "Failed to approve authorization.");
        setStatus("error");
        return;
      }
      setStatus("done");
      // SDK auto-redirects via window.location.assign in browser,
      // but handle it explicitly as a fallback
      const approveResult = data as Record<string, any> | null;
      if (approveResult?.redirect_url) {
        window.location.href = approveResult.redirect_url;
      }
    } catch (err: any) {
      setError(err.message ?? "An unexpected error occurred.");
      setStatus("error");
    }
  }

  function handleContinue() {
    if (!pendingRedirect) return;
    setStatus("done");
    window.location.href = pendingRedirect;
  }

  /**
   * Sign out of the bridge and restart sign-in from the requesting app. The
   * current authorization can't be reused — it's bound to this user.
   */
  async function handleSwitchAccount() {
    setStatus("switching");
    try {
      await createClient().auth.signOut();
    } catch {
      // Even if revoking fails, the restart below lands on the login form
      // only if the session is gone — surface that rather than looping.
    }
    window.location.href = switchAccountUrl ?? "/login";
  }

  async function handleDeny() {
    setStatus("denying");
    try {
      const supabase = createClient();
      const { data, error } =
        await supabase.auth.oauth.denyAuthorization(authorizationId);
      if (error) {
        setError(error.message ?? "Failed to deny authorization.");
        setStatus("error");
        return;
      }
      setStatus("done");
      const denyResult = data as Record<string, any> | null;
      if (denyResult?.redirect_url) {
        window.location.href = denyResult.redirect_url;
      }
    } catch (err: any) {
      setError(err.message ?? "An unexpected error occurred.");
      setStatus("error");
    }
  }

  if (status === "loading") {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-8 shadow-sm">
        <div className="flex flex-col items-center gap-4">
          <Spinner />
          <p className="text-sm text-gray-500">Loading authorization details...</p>
        </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="rounded-lg border border-red-200 bg-white p-8 shadow-sm">
        <div className="mb-4 flex h-12 w-12 mx-auto items-center justify-center rounded-full bg-red-100">
          <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
          </svg>
        </div>
        <h2 className="mb-2 text-center text-lg font-semibold text-gray-900">
          Authorization Error
        </h2>
        <p className="text-center text-sm text-gray-600">{error}</p>
      </div>
    );
  }

  if (status === "done") {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-8 shadow-sm">
        <div className="flex flex-col items-center gap-4">
          <Spinner />
          <p className="text-sm text-gray-500">Redirecting...</p>
        </div>
      </div>
    );
  }

  if (status === "confirm" || (status === "switching" && pendingRedirect)) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-8 py-6">
          {displayLogo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={displayLogo} alt={displayName ?? "Application logo"} className="mx-auto mb-4 h-14 w-auto" />
          )}
          <h1 className="text-center text-xl font-semibold text-gray-900">
            Continue to {displayName ?? "the app"}?
          </h1>
        </div>
        <div className="px-8 py-6">
          <div className="flex items-center gap-3 rounded-md bg-gray-50 px-4 py-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-100 text-sm font-semibold uppercase text-blue-700">
              {userEmail.slice(0, 1)}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Signed in as</p>
              <p className="truncate text-sm font-medium text-gray-900">{userEmail}</p>
            </div>
          </div>
        </div>
        <div className="border-t border-gray-100 px-8 py-5">
          <div className="flex flex-col gap-3">
            <button
              onClick={handleContinue}
              disabled={status === "switching"}
              className="flex w-full items-center justify-center rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
            >
              Continue as {userEmail}
            </button>
            <button
              onClick={handleSwitchAccount}
              disabled={status === "switching"}
              className="flex w-full items-center justify-center rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:ring-offset-2 disabled:opacity-50"
            >
              {status === "switching" ? (
                <>
                  <Spinner size="sm" /> <span className="ml-2">Signing out...</span>
                </>
              ) : (
                "Use a different account"
              )}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
      {/* Header */}
      <div className="border-b border-gray-100 px-8 py-6">
        {displayLogo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={displayLogo}
            alt={displayName ?? "Application logo"}
            className="mx-auto mb-4 h-14 w-auto"
          />
        ) : (
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-blue-50">
            <svg className="h-7 w-7 text-blue-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5V6.75a4.5 4.5 0 1 1 9 0v3.75M3.75 21.75h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H3.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
            </svg>
          </div>
        )}
        <h1 className="text-center text-xl font-semibold text-gray-900">
          Authorize {displayName}
        </h1>
        <p className="mt-1 text-center text-sm text-gray-500">
          This application is requesting access to your account.
        </p>
      </div>

      {/* Body */}
      <div className="px-8 py-6">
        {/* User info */}
        <div className="mb-5 rounded-md bg-gray-50 px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
            Signed in as
          </p>
          <p className="mt-0.5 text-sm font-medium text-gray-900">
            {userEmail}
          </p>
          <button
            type="button"
            onClick={handleSwitchAccount}
            disabled={status !== "ready"}
            className="mt-1 text-xs font-medium text-blue-600 hover:underline disabled:opacity-50"
          >
            Not you? Use a different account
          </button>
        </div>

        {/* Scopes */}
        {details?.scopes && details.scopes.length > 0 && (
          <div className="mb-6">
            <p className="mb-3 text-sm font-medium text-gray-700">
              This will allow{" "}
              <span className="font-semibold">{displayName}</span> to:
            </p>
            <ul className="space-y-2">
              {details.scopes.map((scope) => (
                <li key={scope} className="flex items-start gap-2">
                  <svg className="mt-0.5 h-4 w-4 shrink-0 text-green-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                  </svg>
                  <span className="text-sm text-gray-600">{formatScope(scope)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="border-t border-gray-100 px-8 py-5">
        <div className="flex flex-col gap-3">
          <button
            onClick={handleApprove}
            disabled={status === "approving" || status === "denying"}
            className="flex w-full items-center justify-center rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
          >
            {status === "approving" ? (
              <>
                <Spinner size="sm" /> <span className="ml-2">Approving...</span>
              </>
            ) : (
              "Allow Access"
            )}
          </button>
          <button
            onClick={handleDeny}
            disabled={status === "approving" || status === "denying"}
            className="flex w-full items-center justify-center rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:ring-offset-2 disabled:opacity-50"
          >
            {status === "denying" ? (
              <>
                <Spinner size="sm" /> <span className="ml-2">Denying...</span>
              </>
            ) : (
              "Deny"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function Spinner({ size = "md" }: { size?: "sm" | "md" }) {
  const dim = size === "sm" ? "h-4 w-4" : "h-6 w-6";
  return (
    <svg
      className={`${dim} animate-spin text-blue-600`}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

function formatScope(scope: string): string {
  return scope
    .replace(/[_:.-]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
