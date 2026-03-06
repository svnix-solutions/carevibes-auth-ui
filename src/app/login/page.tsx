import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
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
    redirect(searchParams.next);
  }

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
            <LoginForm next={searchParams.next ?? "/oauth/consent"} />
          </div>
        </div>
      </div>
    </main>
  );
}
