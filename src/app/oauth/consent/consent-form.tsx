"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/browser";

interface AuthorizationDetails {
  client_name: string;
  scopes: string[];
}

type Status = "loading" | "ready" | "approving" | "denying" | "done" | "error";

export function ConsentForm({
  authorizationId,
  userEmail,
}: {
  authorizationId: string;
  userEmail: string;
}) {
  const [details, setDetails] = useState<AuthorizationDetails | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState<string | null>(null);

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

        // If user already consented, auto-redirect
        if (d.redirect_to) {
          window.location.href = d.redirect_to;
          return;
        }

        setDetails({
          client_name: d.client_name ?? d.application?.name ?? "Unknown App",
          scopes: d.scopes
            ? String(d.scopes).split(" ")
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
      const approveResult = data as Record<string, any> | null;
      if (approveResult?.redirect_to) {
        window.location.href = approveResult.redirect_to;
      }
    } catch (err: any) {
      setError(err.message ?? "An unexpected error occurred.");
      setStatus("error");
    }
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
      if (denyResult?.redirect_to) {
        window.location.href = denyResult.redirect_to;
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

  return (
    <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
      {/* Header */}
      <div className="border-b border-gray-100 px-8 py-6">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-blue-50">
          <svg className="h-7 w-7 text-blue-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5V6.75a4.5 4.5 0 1 1 9 0v3.75M3.75 21.75h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H3.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
          </svg>
        </div>
        <h1 className="text-center text-xl font-semibold text-gray-900">
          Authorize {details?.client_name}
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
        </div>

        {/* Scopes */}
        {details?.scopes && details.scopes.length > 0 && (
          <div className="mb-6">
            <p className="mb-3 text-sm font-medium text-gray-700">
              This will allow{" "}
              <span className="font-semibold">{details.client_name}</span> to:
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
