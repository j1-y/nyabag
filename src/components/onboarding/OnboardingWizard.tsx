"use client";

import { Check, Loader2, Sparkles } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { useState, useTransition } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { createBookmark } from "@/lib/actions";
import { completeOnboarding } from "@/lib/onboarding-actions";
import type { Bookmark } from "@/lib/types";

type OnboardingWizardProps = {
  userEmail: string;
};

type OnboardingPhase = "idle" | "submitting" | "success" | "completing";

const SAMPLE_URL = "https://linear.app";

const processingRows = [
  "Saving link",
  "Starting visual preview",
  "Preparing search details",
  "Opening your workspace",
];

function getDisplayUrl(value: string) {
  try {
    const parsed = new URL(value);
    return parsed.hostname.replace(/^www\./, "") || value;
  } catch {
    return value;
  }
}

function buildBookmarkFormData(url: string) {
  const formData = new FormData();
  formData.append("url", url);
  formData.append("tags", "");
  formData.append("title", "");
  formData.append("note", "");
  return formData;
}

export function OnboardingWizard({ userEmail }: OnboardingWizardProps) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [phase, setPhase] = useState<OnboardingPhase>("idle");
  const [createdBookmark, setCreatedBookmark] = useState<Bookmark | null>(null);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  const isBusy = isPending || phase === "submitting" || phase === "completing";
  const canSubmit = url.trim().length > 0 && !isBusy;
  const showSuccess =
    (phase === "success" || phase === "completing") && createdBookmark !== null;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextUrl = url.trim();
    if (!nextUrl || isBusy) return;

    setError("");
    setCreatedBookmark(null);
    setPhase("submitting");

    startTransition(async () => {
      const result = await createBookmark(buildBookmarkFormData(nextUrl));

      if (!result.success) {
        setError(result.error);
        setPhase("idle");
        return;
      }

      setCreatedBookmark(result.data);
      setPhase("success");
    });
  }

  function finishOnboarding() {
    if (phase === "completing") return;

    setError("");
    setPhase("completing");

    startTransition(async () => {
      const result = await completeOnboarding();

      if (!result.success) {
        setError(result.error);
        setPhase(createdBookmark ? "success" : "idle");
        return;
      }

      router.replace("/");
    });
  }

  return (
    <main className="min-h-dvh bg-background px-4 py-8 text-foreground sm:px-6">
      <div className="mx-auto flex min-h-[calc(100dvh-4rem)] w-full max-w-[560px] flex-col items-center justify-center gap-5">
        <div className="flex items-center gap-3 self-start">
          <Image
            src="/assets/logo.svg"
            alt="Nyabag"
            width={32}
            height={32}
            className="h-8 w-8 object-contain"
            priority
          />
          <div className="min-w-0">
            <p className="text-sm font-semibold leading-5">Nyabag</p>
            {userEmail && (
              <p className="truncate text-xs leading-4 text-muted-foreground">
                Onboarding for {userEmail}
              </p>
            )}
          </div>
        </div>

        <Card className="w-full">
          <CardHeader className="gap-3">
            {showSuccess ? (
              <Badge variant="success" className="min-h-7 px-2 py-1">
                <Check aria-hidden="true" />
                Memory created
              </Badge>
            ) : (
              <Badge variant="ai" className="min-h-7 px-2 py-1">
                <Sparkles aria-hidden="true" />
                First memory
              </Badge>
            )}
            <div className="grid gap-2">
              <CardTitle className="text-2xl leading-8">
                {phase === "submitting"
                  ? "Creating your memory"
                  : showSuccess
                    ? "Your first memory is saved"
                    : "Save your first memory"}
              </CardTitle>
              <CardDescription>
                {showSuccess
                  ? "Preview details may finish processing in the dashboard."
                  : "Paste a website, product, or design reference. Nyabag will save it as a visual memory you can search later."}
              </CardDescription>
            </div>
          </CardHeader>

          <CardContent className="grid gap-4">
            {error && (
              <Alert variant="destructive" role="alert">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {phase === "submitting" ? (
              <div className="grid gap-2" aria-live="polite" aria-busy="true">
                {processingRows.map((row, index) => (
                  <div
                    key={row}
                    className="flex items-center gap-3 rounded-[10px] border border-border bg-surface-muted px-3 py-2 text-sm text-muted-foreground"
                  >
                    {index === 0 ? (
                      <Loader2
                        className="size-4 animate-spin text-accent motion-reduce:animate-none"
                        aria-hidden="true"
                      />
                    ) : (
                      <span className="size-4 rounded-full border border-border-subtle bg-surface" />
                    )}
                    <span>{row}</span>
                  </div>
                ))}
              </div>
            ) : showSuccess && createdBookmark ? (
              <BookmarkPreview bookmark={createdBookmark} />
            ) : (
              <form className="grid gap-4" onSubmit={handleSubmit}>
                <Field>
                  <FieldLabel htmlFor="first-memory-url">Website URL</FieldLabel>
                  <Input
                    id="first-memory-url"
                    name="url"
                    type="text"
                    inputMode="url"
                    autoComplete="url"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    placeholder="Paste a website URL"
                    value={url}
                    onChange={(event) => {
                      setUrl(event.target.value);
                      setError("");
                    }}
                    disabled={isBusy}
                  />
                </Field>

                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <Button type="submit" className="sm:w-auto" disabled={!canSubmit}>
                    {isBusy ? (
                      <Loader2
                        className="animate-spin motion-reduce:animate-none"
                        aria-hidden="true"
                      />
                    ) : null}
                    {isBusy ? "Creating memory" : "Create memory"}
                  </Button>

                  <Button
                    type="button"
                    variant="ghost"
                    className="justify-start sm:justify-center"
                    onClick={() => {
                      setUrl(SAMPLE_URL);
                      setError("");
                    }}
                    disabled={isBusy}
                  >
                    Try sample
                  </Button>
                </div>
              </form>
            )}
          </CardContent>

          <CardFooter className="flex flex-col-reverse items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between">
            <Button
              type="button"
              variant="ghost"
              className="justify-center text-muted-foreground"
              onClick={finishOnboarding}
              disabled={isBusy}
            >
              I&apos;ll add one later
            </Button>

            {showSuccess && (
              <Button type="button" onClick={finishOnboarding} disabled={isBusy}>
                {phase === "completing" ? (
                  <Loader2
                    className="animate-spin motion-reduce:animate-none"
                    aria-hidden="true"
                  />
                ) : null}
                Open Nyabag
              </Button>
            )}
          </CardFooter>
        </Card>
      </div>
    </main>
  );
}

function BookmarkPreview({ bookmark }: { bookmark: Bookmark }) {
  const colors = Array.isArray(bookmark.palette) ? bookmark.palette.slice(0, 5) : [];
  const tags = Array.isArray(bookmark.tags) ? bookmark.tags.filter(Boolean) : [];
  const displayUrl = getDisplayUrl(bookmark.url);

  return (
    <div className="overflow-hidden rounded-[10px] border border-border bg-surface shadow-[var(--shadow-xs)]">
      {bookmark.screenshot_url ? (
        <div
          className="h-40 border-b border-border bg-surface-muted bg-cover bg-top"
          style={{ backgroundImage: `url(${bookmark.screenshot_url})` }}
          role="img"
          aria-label={`${bookmark.title} preview`}
        />
      ) : (
        <div className="relative h-40 border-b border-border bg-surface-muted">
          <Skeleton className="h-full w-full rounded-none" />
          <div className="absolute inset-0 grid place-items-center text-xs font-medium text-muted-foreground">
            Preview processing
          </div>
        </div>
      )}

      <div className="grid gap-3 p-4">
        <div className="grid gap-1">
          <h2 className="truncate text-base font-semibold leading-6">
            {bookmark.title || displayUrl}
          </h2>
          <p className="truncate text-sm leading-5 text-muted-foreground">{displayUrl}</p>
        </div>

        {(colors.length > 0 || tags.length > 0) && (
          <div className="flex flex-wrap items-center gap-2">
            {colors.length > 0 && (
              <div className="flex items-center gap-1" aria-label="Bookmark palette">
                {colors.map((color, index) => (
                  <span
                    key={`${color}-${index}`}
                    className="size-4 rounded-full border border-border"
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            )}

            {tags.map((tag) => (
              <Badge key={tag} variant="subtle" className="min-h-7 px-2 py-1">
                {tag}
              </Badge>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
