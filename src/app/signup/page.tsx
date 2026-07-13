"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { AuthShell } from "@/components/auth/AuthShell";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldHint, FieldLabel } from "@/components/ui/field";
import { HugeIcon } from "@/components/ui/huge-icon";
import { IconCheckCircle, IconEye, IconEyeOff, IconLoader } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { timeAsync } from "@/lib/perf";
import { getSafeInternalPath } from "@/lib/security/redirect-safety";
import { createClient } from "@/lib/supabase/client";

function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const nextPath = getSafeInternalPath(searchParams.get("next"), "/onboarding");

  const supabaseReady =
    !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_URL !== "https://your-project-id.supabase.co";
  const passwordReady = password.length >= 8;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (!supabaseReady) {
      setError("Supabase is not configured. Add the local environment values and restart the app.");
      return;
    }
    if (!passwordReady) {
      setError("Use at least 8 characters for your password.");
      return;
    }

    setLoading(true);
    try {
      await timeAsync("signup submit client flow", async () => {
        const supabase = createClient();
        const { data, error: authError } = await supabase.auth.signUp({ email, password });

        if (authError) {
          setError(authError.message);
          setLoading(false);
          return;
        }
        if (data.session) {
          router.replace(nextPath);
          return;
        }

        setSuccess("Check your email to confirm your account, then sign in to continue.");
        setLoading(false);
      });
    } catch (caughtError: unknown) {
      setError(caughtError instanceof Error ? caughtError.message : "Sign up failed");
      setLoading(false);
    }
  }

  return (
    <AuthShell
      eyebrow="A fresh start"
      title="Create your account"
      subtitle="Build a personal visual memory for everything that inspires you."
      visualTitle="Capture ideas now. Rediscover them when they matter."
      visualCopy="Save references, organize your thinking, and keep creative momentum moving in one focused workspace."
    >
      <form className="auth-form" onSubmit={handleSubmit}>
        {error && (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {success && (
          <Alert variant="success" role="status" className="auth-success">
            <HugeIcon icon={IconCheckCircle} size={18} />
            <AlertDescription>{success}</AlertDescription>
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
              minLength={8}
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Create a password"
              aria-describedby="password-hint"
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
          <FieldHint id="password-hint" className={passwordReady ? "auth-hint-ready" : undefined}>
            {passwordReady ? "Password length looks good." : "Use at least 8 characters."}
          </FieldHint>
        </Field>

        <Button className="auth-submit" type="submit" disabled={loading || !supabaseReady}>
          {loading && <HugeIcon icon={IconLoader} size={18} className="spin-icon" />}
          {loading ? "Creating account…" : "Create account"}
        </Button>
      </form>

      <p className="auth-footer">
        Already have an account?{" "}
        <Link href={`/login?next=${encodeURIComponent(nextPath)}`}>Sign in</Link>
      </p>
    </AuthShell>
  );
}

function SignupFallback() {
  return (
    <AuthShell
      eyebrow="A fresh start"
      title="Preparing signup…"
      subtitle="Getting your account page ready."
      visualTitle="Capture ideas now. Rediscover them when they matter."
      visualCopy="Your new visual workspace will be ready in a moment."
    />
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={<SignupFallback />}>
      <SignupForm />
    </Suspense>
  );
}
