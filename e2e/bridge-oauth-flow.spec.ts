import { test, expect } from "@playwright/test";

/**
 * End-to-end test for the PKCE Bridge OAuth flow:
 *
 *   1. ERPNext login → click "Login with supabase"
 *   2. → Bridge /api/bridge/authorize → Supabase /auth/v1/oauth/authorize
 *   3. → Auth UI /login (user must sign in to Supabase)
 *   4. → Auth UI /oauth/consent (approve or auto-redirect)
 *   5. → Bridge /api/bridge/callback → ERPNext (logged in)
 *   6. → Navigate to sales invoice
 *
 * All config is read from environment variables (see e2e/.env.example).
 */

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name} (see e2e/.env.example)`);
  }
  return value;
}

const ERPNEXT_URL = requireEnv("E2E_ERPNEXT_URL");
const AUTH_UI_URL = requireEnv("E2E_AUTH_UI_URL");
const SUPABASE_EMAIL = requireEnv("E2E_SUPABASE_EMAIL");
const SUPABASE_PASSWORD = requireEnv("E2E_SUPABASE_PASSWORD");
const TARGET_PAGE = process.env.E2E_TARGET_PAGE || "/app/sales-invoice/SINV-26-00002";

test.describe("PKCE Bridge OAuth Flow", () => {
  test("Login to ERPNext via Supabase social login and access sales invoice", async ({
    page,
  }) => {
    // Log all navigations for debugging
    page.on("framenavigated", (frame) => {
      if (frame === page.mainFrame()) {
        console.log(`  [nav] ${frame.url()}`);
      }
    });

    // Log bridge callback requests/responses
    page.on("response", (response) => {
      const url = response.url();
      if (url.includes("/api/bridge/") || url.includes("/oauth/")) {
        console.log(`  [resp] ${response.status()} ${url.slice(0, 200)}`);
      }
    });

    // ── Step 1: Go to ERPNext login page ──
    console.log("Step 1: Navigating to ERPNext login page...");
    await page.goto(`${ERPNEXT_URL}/login`, { waitUntil: "networkidle" });
    await page.screenshot({ path: "e2e/screenshots/01-erpnext-login.png" });

    // ── Step 2: Click the Supabase social login button ──
    console.log("Step 2: Clicking 'Login with supabase' button...");
    const supabaseButton = page.locator(
      'a:has-text("supabase"), button:has-text("supabase"), .social-logins a:has-text("supabase")'
    );
    await expect(supabaseButton.first()).toBeVisible({ timeout: 10_000 });
    await supabaseButton.first().click();

    // Wait for navigation to the auth UI login page
    await page.waitForURL("**/login**", { timeout: 30_000 });
    await page.waitForLoadState("networkidle");
    const afterClickUrl = page.url();
    console.log(`  Redirected to: ${afterClickUrl}`);
    await page.screenshot({ path: "e2e/screenshots/02-auth-ui-login.png" });

    // ── Step 3: Sign in on the Auth UI login page ──
    if (afterClickUrl.includes(new URL(AUTH_UI_URL).host)) {
      console.log("Step 3: On Auth UI login page, entering Supabase credentials...");

      await page.locator("#email").fill(SUPABASE_EMAIL);
      await page.locator("#password").fill(SUPABASE_PASSWORD);
      await page.screenshot({
        path: "e2e/screenshots/03-auth-ui-creds-filled.png",
      });

      await page.locator('button[type="submit"]:has-text("Sign In")').click();

      // Wait for redirect — either to consent page or auto-redirect back to ERPNext
      console.log("  Waiting for redirect after sign in...");
      await page.waitForURL(
        (url) =>
          url.pathname.includes("/oauth/consent") ||
          url.origin === ERPNEXT_URL ||
          url.pathname.includes("/api/bridge/callback"),
        { timeout: 30_000 }
      );
      await page.waitForLoadState("networkidle");
    }

    const afterLoginUrl = page.url();
    console.log(`  URL after Auth UI sign-in: ${afterLoginUrl}`);
    await page.screenshot({ path: "e2e/screenshots/04-after-auth-login.png" });

    // ── Step 4: Handle consent page if shown ──
    if (afterLoginUrl.includes("/oauth/consent")) {
      console.log("Step 4: On consent page, waiting for form or auto-redirect...");
      await page.screenshot({ path: "e2e/screenshots/05-consent-page.png" });

      // Wait for either: "Allow Access" button, auto-redirect, or error
      const result = await Promise.race([
        page
          .locator('button:has-text("Allow Access")')
          .waitFor({ state: "visible", timeout: 15_000 })
          .then(() => "consent-form" as const),
        page
          .waitForURL(
            (url) => !url.pathname.includes("/oauth/consent"),
            { timeout: 15_000 }
          )
          .then(() => "auto-redirect" as const),
        page
          .locator("text=Authorization Error")
          .waitFor({ state: "visible", timeout: 15_000 })
          .then(() => "error" as const),
      ]);

      if (result === "consent-form") {
        console.log("  Consent form loaded. Clicking 'Allow Access'...");
        await page.locator('button:has-text("Allow Access")').click();
        await page.screenshot({ path: "e2e/screenshots/06-after-approve.png" });
      } else if (result === "error") {
        const errorText = await page.locator("text=Authorization Error").textContent();
        console.log(`  Consent error: ${errorText}`);
        await page.screenshot({ path: "e2e/screenshots/06-consent-error.png" });
      } else {
        console.log("  Auto-redirect from consent page.");
        await page.screenshot({ path: "e2e/screenshots/06-auto-redirect.png" });
      }

      // Wait for redirect to ERPNext (may go through bridge callback first)
      console.log("  Waiting for redirect chain to complete...");
      await page
        .waitForURL(`${ERPNEXT_URL}/**`, { timeout: 30_000 })
        .catch(() => {
          console.log(`  Timeout. Current: ${page.url()}`);
        });
    } else if (afterLoginUrl.includes(ERPNEXT_URL)) {
      console.log("Step 4: Already redirected to ERPNext (auto-approved).");
    } else {
      console.log(`Step 4: Unexpected URL: ${afterLoginUrl}`);
      await page
        .waitForURL(`${ERPNEXT_URL}/**`, { timeout: 30_000 })
        .catch(() => {
          console.log(`  Timeout. Current: ${page.url()}`);
        });
    }

    await page.waitForLoadState("networkidle");
    const afterFlowUrl = page.url();
    console.log(`  URL after full OAuth flow: ${afterFlowUrl}`);
    await page.screenshot({ path: "e2e/screenshots/07-after-full-flow.png" });

    // Check for error in the redirect URL
    const afterFlowParsed = new URL(afterFlowUrl);
    const flowError = afterFlowParsed.searchParams.get("error");
    const flowErrorDesc = afterFlowParsed.searchParams.get("error_description");
    if (flowError) {
      console.log(`  *** OAuth Error: ${flowError}`);
      console.log(`  *** Description: ${flowErrorDesc}`);
    }

    // ── Step 5: Navigate to the target page ──
    const fullTargetUrl = `${ERPNEXT_URL}${TARGET_PAGE}`;
    console.log(`Step 5: Navigating to ${TARGET_PAGE}...`);
    await page.goto(fullTargetUrl, { waitUntil: "networkidle" });
    await page.screenshot({ path: "e2e/screenshots/08-target-page.png" });

    const finalUrl = page.url();
    console.log(`  Final URL: ${finalUrl}`);

    if (finalUrl.includes("/login")) {
      await page.screenshot({
        path: "e2e/screenshots/09-redirected-to-login.png",
      });
      console.log("  FAILED: Redirected back to login — not authenticated.");
    }

    // Assert we're not on the login page (i.e. we're authenticated)
    expect(finalUrl).not.toContain("/login");
    console.log("Test passed!");
  });
});
