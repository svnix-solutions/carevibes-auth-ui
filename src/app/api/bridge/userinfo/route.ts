import { NextRequest, NextResponse } from "next/server";
import { getBridgeConfig } from "@/lib/bridge/config";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return NextResponse.json(
      {
        error: "invalid_token",
        error_description: "Missing or invalid Authorization header",
      },
      { status: 401 }
    );
  }

  const accessToken = authHeader.slice(7);

  const supabaseResponse = await fetch(
    `${getBridgeConfig().supabaseUrl}/auth/v1/user`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY!,
      },
    }
  );

  if (!supabaseResponse.ok) {
    const errorText = await supabaseResponse.text();
    console.error(
      "[bridge/userinfo] Supabase user fetch failed:",
      supabaseResponse.status,
      errorText
    );
    return NextResponse.json(
      {
        error: "invalid_token",
        error_description: "Failed to retrieve user information",
      },
      { status: supabaseResponse.status }
    );
  }

  const supabaseUser = await supabaseResponse.json();

  const userinfo = {
    sub: supabaseUser.id,
    email: supabaseUser.email,
    email_verified: supabaseUser.email_confirmed_at != null,
    name:
      supabaseUser.user_metadata?.full_name ||
      supabaseUser.user_metadata?.name ||
      supabaseUser.email,
    given_name: supabaseUser.user_metadata?.first_name,
    family_name: supabaseUser.user_metadata?.last_name,
    picture: supabaseUser.user_metadata?.avatar_url,
  };

  return NextResponse.json(userinfo);
}
