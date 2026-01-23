"use client";

import { useState, useEffect } from "react";
import { AppLayout } from "@/components/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export default function QuickBooksTokenPage() {
  const [authUrl, setAuthUrl] = useState<string | null>(null);
  const [authCode, setAuthCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [tokenResult, setTokenResult] = useState<{
    refresh_token: string;
    access_token: string;
    expires_in: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pushingToVercel, setPushingToVercel] = useState(false);
  const [pushedToVercel, setPushedToVercel] = useState(false);
  const [deployStatus, setDeployStatus] = useState<"idle" | "deploying" | "deployed" | "error">("idle");

  // Fetch authorization URL on mount
  useEffect(() => {
    fetch("/api/quickbooks/token")
      .then((res) => res.json())
      .then((data) => {
        if (data.authUrl) {
          setAuthUrl(data.authUrl);
        } else if (data.error) {
          setError(data.error);
        }
      })
      .catch((err) => {
        setError(err.message);
      });
  }, []);

  const handleExchangeCode = async () => {
    if (!authCode.trim()) {
      toast.error("Please enter an authorization code");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/quickbooks/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: authCode }),
      });

      const data = await response.json();

      if (data.success) {
        setTokenResult(data);
        toast.success("Token retrieved successfully!");
      } else {
        setError(data.error_description || data.error || "Token exchange failed");
        toast.error("Token exchange failed");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      toast.error("Failed to exchange code");
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard!");
  };

  const handlePushToVercel = async () => {
    if (!tokenResult?.refresh_token) return;

    setPushingToVercel(true);
    setDeployStatus("idle");

    try {
      // Step 1: Push token to Vercel env vars
      const response = await fetch("/api/vercel/env", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: "QB_REFRESH_TOKEN",
          value: tokenResult.refresh_token,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setPushedToVercel(true);
        toast.success("Token pushed to Vercel! Starting redeploy...");

        // Step 2: Trigger redeploy
        setDeployStatus("deploying");
        try {
          const deployResponse = await fetch("/api/vercel/deploy", {
            method: "POST",
          });

          const deployData = await deployResponse.json();

          if (deployData.success) {
            setDeployStatus("deployed");
            toast.success("Redeploy triggered! New token will be active in ~1 minute.");
          } else {
            setDeployStatus("error");
            toast.error("Token saved but redeploy failed: " + (deployData.error || "Unknown error"));
          }
        } catch (deployErr) {
          setDeployStatus("error");
          toast.error("Token saved but redeploy failed");
        }
      } else {
        toast.error(data.error || "Failed to push to Vercel");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to push to Vercel");
    } finally {
      setPushingToVercel(false);
    }
  };

  return (
    <AppLayout>
      <div className="space-y-8 max-w-3xl">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <span className="text-4xl">🔑</span>
            QuickBooks Token Refresh
          </h1>
          <p className="text-gray-500 mt-1">
            Re-authorize Voyage App Store access to QuickBooks
          </p>
        </div>

        {/* Step 1: Authorize */}
        <div className="rounded-xl border-2 border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-800 mb-4 flex items-center gap-2">
            <span className="bg-blue-500 text-white rounded-full w-8 h-8 flex items-center justify-center text-sm font-bold">1</span>
            Authorize Access
          </h2>

          <div className="space-y-4 text-slate-600">
            <ol className="list-decimal list-inside space-y-2 ml-2">
              <li>Click the authorization link below</li>
              <li>Sign in to QuickBooks and select <strong>Voyage Advisory</strong></li>
              <li>You&apos;ll be redirected to a page with a URL containing a code</li>
              <li>Copy the code from the URL (between <code className="bg-slate-100 px-1 rounded">code=</code> and <code className="bg-slate-100 px-1 rounded">&state</code>)</li>
            </ol>

            {authUrl ? (
              <a
                href={authUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg font-medium transition-colors"
              >
                🔗 Authorize Voyage App Store
              </a>
            ) : error ? (
              <div className="text-red-600 bg-red-50 p-4 rounded-lg">
                {error}
              </div>
            ) : (
              <div className="text-slate-400">Loading authorization URL...</div>
            )}

            <div className="bg-slate-50 p-4 rounded-lg text-sm">
              <p className="font-medium text-slate-700 mb-2">Example redirect URL:</p>
              <code className="text-xs break-all text-slate-500">
                https://developer.intuit.com/v2/OAuth2Playground/RedirectUrl?code=<span className="text-green-600 font-bold">AB11731076529rK8H4...</span>&state=voyage_auth&realmId=123456
              </code>
              <p className="mt-2 text-slate-500">Copy only the highlighted part (between code= and &state)</p>
            </div>
          </div>
        </div>

        {/* Step 2: Exchange Code */}
        <div className="rounded-xl border-2 border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-800 mb-4 flex items-center gap-2">
            <span className="bg-blue-500 text-white rounded-full w-8 h-8 flex items-center justify-center text-sm font-bold">2</span>
            Get Refresh Token
          </h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Paste the authorization code:
              </label>
              <Input
                value={authCode}
                onChange={(e) => setAuthCode(e.target.value)}
                placeholder="e.g., AB11731076529rK8H4zmKqL2pBv1ZcmcPbN..."
                className="font-mono text-sm"
              />
            </div>

            <Button
              onClick={handleExchangeCode}
              disabled={loading || !authCode.trim()}
              className="w-full"
              size="lg"
            >
              {loading ? (
                <>
                  <span className="animate-spin mr-2">⟳</span>
                  Exchanging Code...
                </>
              ) : (
                "🔄 Get Refresh Token"
              )}
            </Button>

            {error && !tokenResult && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-red-700 font-medium">Error: {error}</p>
                <div className="mt-3 text-sm text-red-600">
                  <p className="font-medium">Common causes:</p>
                  <ul className="list-disc list-inside mt-1 space-y-1">
                    <li>Authorization code already used (they expire after one use)</li>
                    <li>Code expired (they expire after 10 minutes)</li>
                    <li>Incorrect code format</li>
                  </ul>
                  <p className="mt-2 font-medium">Solution: Go back to Step 1 and get a new code</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Success Result */}
        {tokenResult && (
          <div className="rounded-xl border-2 border-emerald-200 bg-emerald-50 p-6 shadow-sm">
            <h2 className="text-xl font-semibold text-emerald-800 mb-4 flex items-center gap-2">
              🎉 Success! Token Retrieved
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  New Refresh Token:
                </label>
                <div className="relative">
                  <code className="block bg-white p-4 rounded-lg text-sm font-mono break-all border border-emerald-200">
                    {tokenResult.refresh_token}
                  </code>
                  <Button
                    variant="outline"
                    size="sm"
                    className="absolute top-2 right-2"
                    onClick={() => copyToClipboard(tokenResult.refresh_token)}
                  >
                    📋 Copy
                  </Button>
                </div>
              </div>

              {/* Push to Vercel Button */}
              {!pushedToVercel ? (
                <Button
                  onClick={handlePushToVercel}
                  disabled={pushingToVercel}
                  className="w-full bg-black hover:bg-gray-800 text-white"
                  size="lg"
                >
                  {pushingToVercel ? (
                    <>
                      <span className="animate-spin mr-2">⟳</span>
                      {deployStatus === "deploying" ? "Triggering redeploy..." : "Pushing to Vercel..."}
                    </>
                  ) : (
                    "▲ Push to Vercel & Redeploy"
                  )}
                </Button>
              ) : (
                <div className={`border rounded-lg p-4 text-center ${
                  deployStatus === "deployed"
                    ? "bg-emerald-100 border-emerald-300"
                    : deployStatus === "deploying"
                    ? "bg-blue-100 border-blue-300"
                    : deployStatus === "error"
                    ? "bg-amber-100 border-amber-300"
                    : "bg-emerald-100 border-emerald-300"
                }`}>
                  {deployStatus === "deploying" ? (
                    <>
                      <p className="text-blue-800 font-semibold flex items-center justify-center gap-2">
                        <span className="animate-spin">⟳</span> Redeploying...
                      </p>
                      <p className="text-sm text-blue-600 mt-1">
                        This usually takes about 1 minute.
                      </p>
                    </>
                  ) : deployStatus === "deployed" ? (
                    <>
                      <p className="text-emerald-800 font-semibold">✅ Token saved & redeploy triggered!</p>
                      <p className="text-sm text-emerald-600 mt-1">
                        The new token will be active in about 1 minute.
                      </p>
                    </>
                  ) : deployStatus === "error" ? (
                    <>
                      <p className="text-amber-800 font-semibold">⚠️ Token saved but redeploy failed</p>
                      <p className="text-sm text-amber-600 mt-1">
                        Manually redeploy or wait for the next deployment.
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-emerald-800 font-semibold">✅ Token pushed to Vercel!</p>
                      <p className="text-sm text-emerald-600 mt-1">
                        The new token will take effect on the next deployment.
                      </p>
                    </>
                  )}
                </div>
              )}

              <div className="bg-white rounded-lg p-4 border border-emerald-200">
                <p className="text-sm text-amber-600">
                  ⏰ <strong>Token expires in:</strong> ~100 days from now. Set a calendar reminder!
                </p>
              </div>

              <details className="bg-white rounded-lg p-4 border border-emerald-200">
                <summary className="font-medium text-slate-700 cursor-pointer">
                  🔍 Token Details
                </summary>
                <div className="mt-3 space-y-2 text-sm text-slate-600">
                  <p><strong>Access Token (1 hour):</strong> {tokenResult.access_token.substring(0, 30)}...</p>
                  <p><strong>Refresh Token (100 days):</strong> {tokenResult.refresh_token.substring(0, 30)}...</p>
                  <p><strong>Access token expires in:</strong> {tokenResult.expires_in} seconds (~1 hour)</p>
                </div>
              </details>
            </div>
          </div>
        )}

        {/* Troubleshooting */}
        <details className="rounded-xl border-2 border-slate-200 bg-white p-6 shadow-sm">
          <summary className="text-lg font-semibold text-slate-800 cursor-pointer">
            ❓ Troubleshooting
          </summary>
          <div className="mt-4 space-y-4 text-sm text-slate-600">
            <div>
              <p className="font-medium text-slate-700">&quot;Invalid grant&quot; error:</p>
              <ul className="list-disc list-inside ml-2 mt-1">
                <li>The authorization code has already been used</li>
                <li>The code has expired (10 minute limit)</li>
                <li>Solution: Go back to Step 1 and get a fresh code</li>
              </ul>
            </div>
            <div>
              <p className="font-medium text-slate-700">&quot;Invalid client&quot; error:</p>
              <ul className="list-disc list-inside ml-2 mt-1">
                <li>QB_CLIENT_ID or QB_CLIENT_SECRET in environment variables is incorrect</li>
                <li>Contact Andrew to verify credentials</li>
              </ul>
            </div>
            <div>
              <p className="font-medium text-slate-700">Can&apos;t find the code in the URL:</p>
              <ul className="list-disc list-inside ml-2 mt-1">
                <li>After authorizing, look at the browser address bar</li>
                <li>The URL will contain <code className="bg-slate-100 px-1 rounded">?code=XXXXX&state=voyage_auth</code></li>
                <li>Copy only the part between <code className="bg-slate-100 px-1 rounded">code=</code> and <code className="bg-slate-100 px-1 rounded">&state</code></li>
              </ul>
            </div>
            <div>
              <p className="font-medium text-slate-700">How often do I need to do this?</p>
              <ul className="list-disc list-inside ml-2 mt-1">
                <li>QuickBooks refresh tokens expire every ~100 days</li>
                <li>You&apos;ll know when the Commission Calculator fails with auth errors</li>
                <li>Set a calendar reminder for 90 days from now</li>
              </ul>
            </div>
          </div>
        </details>
      </div>
    </AppLayout>
  );
}
