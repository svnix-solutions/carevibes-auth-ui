import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/safe-next";
import { ResetPasswordForm } from "./reset-password-form";

/**
 * Where the "set a new password" email link lands, after /auth/callback has
 * signed the user in with the link's code.
 */
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: { next?: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-8 py-6">
            <h1 className="text-center text-xl font-semibold text-gray-900">Set a new password</h1>
            {user?.email && <p className="mt-1 text-center text-sm text-gray-500">for {user.email}</p>}
          </div>
          <div className="px-8 py-6">
            {user ? (
              <ResetPasswordForm next={safeNext(searchParams.next, "")} />
            ) : (
              <div className="flex flex-col gap-3 text-center">
                <p className="text-sm text-gray-600">
                  This reset link has expired or was opened in a different browser. Please go
                  back to the app, choose <strong>Forgot password?</strong> again, and open the
                  new link on this device.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
