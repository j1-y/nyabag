"use client";

import { HugeIcon } from "@/components/ui/huge-icon";
import { IconLoader } from "@/components/ui/icons";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { timeAsync } from "@/lib/perf";
import { getSafeInternalPath } from "@/lib/security/redirect-safety";

function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const nextPath = getSafeInternalPath(searchParams.get("next"), "/onboarding");

  const supabaseReady =
    !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_URL !== "https://your-project-id.supabase.co";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!supabaseReady) {
      setError("Supabase is not configured. See the setup guide on the home page.");
      return;
    }
    setError("");
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setLoading(true);
    try {
      await timeAsync("signup submit client flow", async () => {
        const supabase = createClient();
        const { data, error: authError } = await supabase.auth.signUp({
          email,
          password,
        });
        if (authError) {
          setError(authError.message);
          setLoading(false);
          return;
        }

        if (data.session) {
          router.replace(nextPath);
          return;
        }

        setError(
          "Check your email to confirm your account, then sign in to continue where you left off."
        );
        setLoading(false);
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Sign up failed");
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">
            <img src="/assets/logo.svg" alt="Nyabag logo" className="h-8 w-auto object-contain"/>
            </div>
        <h1 className="auth-title">Create account</h1>
        <p className="auth-subtitle">Start saving your favourite sites</p>
        <form className="auth-form" onSubmit={handleSubmit}>
          {error && <div className="auth-error">{error}</div>}
          {!supabaseReady && (
            <div className="auth-error">
              ⚠️ Supabase env vars not configured. Fill in <code>.env.local</code> and restart the server.
            </div>
          )}
          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </div>
          <div className="field">
            <label htmlFor="password">
              Password <span className="hint">(min 8 chars)</span>
            </label>
            <input
              id="password"
              type="password"
              required
              autoComplete="new-password"
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>
          <button
            type="submit"
            className="btn-primary auth-submit"
            disabled={loading}
          >
            {loading && (
              <HugeIcon icon={IconLoader}
                size={18} className="spin-icon"
                style={{ animation: "spin 1s linear infinite" }}
              />
            )}
            {loading ? "Creating account…" : "Create account"}
          </button>
        </form>
        <p className="auth-footer">
          Already have an account? <Link href={`/login?next=${encodeURIComponent(nextPath)}`}>Sign in</Link>
        </p>
      </div>
    </div>
  );
}

function SignupFallback() {
  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">
          <img src="/assets/logo.svg" alt="Nyabag logo" className="h-8 w-auto object-contain" />
        </div>
        <h1 className="auth-title">Loading signup...</h1>
        <p className="auth-subtitle">Preparing your account page</p>
      </div>
    </div>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={<SignupFallback />}>
      <SignupForm />
    </Suspense>
  );
}
