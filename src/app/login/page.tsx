import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { downstreamClients, getBridgeConfig } from "@/lib/bridge/config";
import { safeNext } from "@/lib/safe-next";
import { LoginForm } from "./login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: { next?: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Already logged in — go straight to the next URL
  if (user && searchParams.next) {
    redirect(safeNext(searchParams.next));
  }

  // The app that started this sign-in (set by /api/bridge/authorize).
  const downstreamClientId = cookies().get(
    getBridgeConfig().downstreamClientCookieName
  )?.value;
  const allowSignUp = Boolean(
    downstreamClientId && downstreamClients[downstreamClientId]?.allowSignUp
  );

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
          {/* Header */}
          <div className="border-b border-gray-100 px-8 py-6">
            <h1 className="text-center text-xl font-semibold text-gray-900">
              Sign In
            </h1>
            <p className="mt-1 text-center text-sm text-gray-500">
              Sign in to authorize access to your account.
            </p>
          </div>

          {/* Form */}
          <div className="px-8 py-6">
            <LoginForm
              next={safeNext(searchParams.next)}
              allowSignUp={allowSignUp}
            />
          </div>
        </div>
      </div>
    </main>
  );
}
