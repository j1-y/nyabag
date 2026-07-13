"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { AuthShell } from "@/components/auth/AuthShell";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { HugeIcon } from "@/components/ui/huge-icon";
import { IconEye, IconEyeOff, IconLoader } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { timeAsync } from "@/lib/perf";
import { getSafeInternalPath } from "@/lib/security/redirect-safety";
import { createClient } from "@/lib/supabase/client";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const supabaseReady =
    !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_URL !== "https://your-project-id.supabase.co";
  const nextPath = getSafeInternalPath(searchParams.get("next"), "/");

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!supabaseReady) {
      setError("Supabase is not configured. Add the local environment values and restart the app.");
      return;
    }

    setError("");
    setLoading(true);
    try {
      await timeAsync("login submit client flow", async () => {
        const supabase = createClient();
        const { error: authError } = await supabase.auth.signInWithPassword({ email, password });

        if (authError) {
          setError(authError.message);
          setLoading(false);
          return;
        }

        router.replace(nextPath);
      });
    } catch (caughtError: unknown) {
      setError(caughtError instanceof Error ? caughtError.message : "Authentication failed");
      setLoading(false);
    }
  }

  return (
    <AuthShell
      eyebrow="Welcome back"
      title="Sign in to Nyabag"
      subtitle="Open your workspace and pick up exactly where you left off."
      visualTitle="Everything worth keeping, in one calm place."
      visualCopy="Return to your bookmarks, screenshots, notes, and visual references without losing your flow."
    >
      <form className="auth-form" onSubmit={handleSubmit}>
        {error && (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {!supabaseReady && (
          <Alert variant="destructive" role="alert">
            <AlertDescription>
              Supabase environment values are missing. Configure <code>.env.local</code> and restart the app.
            </AlertDescription>
          </Alert>
        )}

        <Field>
          <FieldLabel htmlFor="email">Email address</FieldLabel>
          <Input
            id="email"
            type="email"
            required
            autoFocus
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="password">Password</FieldLabel>
          <div className="auth-password-field">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              required
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Enter your password"
            />
            <button
              type="button"
              className="auth-password-toggle"
              aria-label={showPassword ? "Hide password" : "Show password"}
              aria-pressed={showPassword}
              onClick={() => setShowPassword((visible) => !visible)}
            >
              <HugeIcon icon={showPassword ? IconEyeOff : IconEye} size={18} />
            </button>
          </div>
        </Field>

        <Button className="auth-submit" type="submit" disabled={loading || !supabaseReady}>
          {loading && <HugeIcon icon={IconLoader} size={18} className="spin-icon" />}
          {loading ? "Signing in…" : "Sign in"}
        </Button>
      </form>

      <p className="auth-footer">
        New to Nyabag?{" "}
        <Link href={`/signup?next=${encodeURIComponent(nextPath)}`}>Create an account</Link>
      </p>
    </AuthShell>
  );
}

function LoginFallback() {
  return (
    <AuthShell
      eyebrow="Welcome back"
      title="Preparing sign in…"
      subtitle="Loading your secure Nyabag session."
      visualTitle="Everything worth keeping, in one calm place."
      visualCopy="Your bookmarks and visual references will be ready in a moment."
    />
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginFallback />}>
      <LoginForm />
    </Suspense>
  );
}
