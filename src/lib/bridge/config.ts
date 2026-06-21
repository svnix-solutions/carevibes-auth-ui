function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export interface DownstreamClient {
  name: string;
  uri?: string;
  logoUri?: string;
}

// Registry of first-party downstream apps that route through this bridge.
// Add a new entry when onboarding a new app — the key is the client_id sent
// by the downstream when it hits /api/bridge/authorize.
export const downstreamClients: Record<string, DownstreamClient> = {
  "iklera-pos": {
    name: "Iklera POS",
    uri: "https://pos.iklera.com",
    logoUri: "/ikleralogo.png",
  },
};

let _config: ReturnType<typeof loadConfig> | null = null;

function loadConfig() {
  return {
    secret: requireEnv("BRIDGE_SECRET"),
    supabaseClientId: requireEnv("SUPABASE_OAUTH_CLIENT_ID"),
    supabaseClientSecret: requireEnv("SUPABASE_OAUTH_CLIENT_SECRET"),
    supabaseUrl: requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    baseUrl: requireEnv("BRIDGE_BASE_URL"),
    allowedRedirectUris: (process.env.BRIDGE_ALLOWED_REDIRECT_URIS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    bridgeCodeTtl: 120,
    stateCookieName: "__bridge_state" as const,
    stateCookieMaxAge: 600,
    downstreamClientCookieName: "__bridge_downstream_client" as const,
  };
}

export function getBridgeConfig() {
  if (!_config) {
    _config = loadConfig();
  }
  return _config;
}
