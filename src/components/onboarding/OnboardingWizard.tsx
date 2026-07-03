"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Bot,
  Check,
  LayoutGrid,
  Link2,
  Loader2,
  Palette,
  Send,
  ShieldCheck,
  Sparkles,
  Star,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  completeOnboarding,
  saveOnboardingPreferences,
} from "@/lib/onboarding-actions";
import { createTelegramConnectionCode, getTelegramConnection } from "@/lib/actions";
import type {
  OnboardingFocusArea,
  OnboardingPrimaryGoal,
  OnboardingStep,
  OnboardingWorkspaceType,
  TelegramConnection,
} from "@/lib/types";
import Image from "next/image";
import styles from "./OnboardingWizard.module.css";

type TelegramState = {
  configured: boolean;
  connection: TelegramConnection | null;
  botUrl?: string;
};

type OnboardingWizardProps = {
  userEmail: string;
  initialStep: OnboardingStep;
  initialWorkspaceType: OnboardingWorkspaceType | "";
  initialPrimaryGoal: OnboardingPrimaryGoal | "";
  initialFocusArea: OnboardingFocusArea | "";
  telegram: TelegramState;
};

type Choice<T extends string> = {
  value: T;
  title: string;
  description: string;
  icon: LucideIcon;
};

const workspaceChoices: Choice<OnboardingWorkspaceType>[] = [
  {
    value: "solo_creator",
    title: "I'm a solo creator",
    description: "I want a lightweight system for personal inspiration and saving links.",
    icon: UserRound,
  },
  {
    value: "team",
    title: "I'm part of a team",
    description: "My team needs shared workflows, quick capture, and a common reference base.",
    icon: Users,
  },
];

const goalChoices: Choice<OnboardingPrimaryGoal>[] = [
  {
    value: "save_links",
    title: "Save links fast",
    description: "Capture useful sites from anywhere without breaking flow.",
    icon: Link2,
  },
  {
    value: "organize_research",
    title: "Organize research",
    description: "Group sources, patterns, and notes into a clean visual library.",
    icon: BookOpen,
  },
  {
    value: "build_moodboards",
    title: "Build moodboards",
    description: "Turn inspiration into a board that is easy to review and share.",
    icon: Palette,
  },
];

const focusChoices: Choice<OnboardingFocusArea>[] = [
  {
    value: "product_design",
    title: "Product design",
    description: "UI patterns, flows, and product references.",
    icon: LayoutGrid,
  },
  {
    value: "branding",
    title: "Branding",
    description: "Identity systems, colors, typography, and brand direction.",
    icon: Sparkles,
  },
  {
    value: "marketing",
    title: "Marketing",
    description: "Landing pages, campaigns, and growth references.",
    icon: ShieldCheck,
  },
  {
    value: "general",
    title: "General inspiration",
    description: "A broad mix of references across different use cases.",
    icon: Bot,
  },
];

const progressLabels: Record<OnboardingStep, string> = {
  welcome: "Workspace",
  preferences: "Preferences",
  telegram: "Telegram",
  complete: "Dashboard",
};

const TELEGRAM_POLL_INTERVAL_MS = 3000;
const TELEGRAM_POLL_TIMEOUT_MS = 3 * 60 * 1000;

function formatDate(value: string | null) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Kolkata",
  }).format(new Date(value));
}

function choiceState<T extends string>(value: T, selected: T | "") {
  return selected === value;
}

export function OnboardingWizard({
  userEmail,
  initialStep,
  initialWorkspaceType,
  initialPrimaryGoal,
  initialFocusArea,
  telegram,
}: OnboardingWizardProps) {
  const router = useRouter();
  const [step, setStep] = useState<OnboardingStep>(initialStep === "complete" ? "welcome" : initialStep);
  const [workspaceType, setWorkspaceType] = useState<OnboardingWorkspaceType | "">(initialWorkspaceType);
  const [primaryGoal, setPrimaryGoal] = useState<OnboardingPrimaryGoal | "">(initialPrimaryGoal);
  const [focusArea, setFocusArea] = useState<OnboardingFocusArea | "">(initialFocusArea);
  const [telegramState, setTelegramState] = useState<TelegramState>(telegram);
  const [code, setCode] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isPending, startTransition] = useTransition();
  const pollStartedAtRef = useRef<number | null>(null);
  const autoFinishRef = useRef(false);

  const activeStepIndex = useMemo(() => {
    if (step === "preferences") return 1;
    if (step === "telegram") return 2;
    if (step === "complete") return 3;
    return 0;
  }, [step]);

  const stepTitle = useMemo(() => {
    if (step === "preferences") {
      return "What kind of work do you want Nyabag to organize?";
    }
    if (step === "telegram") {
      return telegramState.configured
        ? "Link Telegram to capture links from chats"
        : "Telegram is not configured yet";
    }
    return "Automate your busywork";
  }, [step, telegramState.configured]);

  const stepDescription = useMemo(() => {
    if (step === "preferences") {
      return "Pick the goal and surface area that matter most right now. You can refine this later from your profile.";
    }
    if (step === "telegram") {
      return telegramState.configured
        ? "Generate a connection code, send it to the bot, then Nyabag will keep capturing URLs for you."
        : "You can still complete onboarding while the Telegram integration is offline.";
    }
    return "Choose the setup that matches how you work so the dashboard opens with the right defaults.";
  }, [step, telegramState.configured]);

  useEffect(() => {
    if (step !== "telegram") {
      pollStartedAtRef.current = null;
      return;
    }

    const pending = telegramState.connection?.status === "pending";
    if (!pending) return;

    if (!pollStartedAtRef.current) {
      pollStartedAtRef.current = Date.now();
    }

    let cancelled = false;
    const startedAt = pollStartedAtRef.current;

    async function refreshConnection() {
      const now = Date.now();
      if (now - startedAt > TELEGRAM_POLL_TIMEOUT_MS) return;
      if (expiresAt && new Date(expiresAt).getTime() <= now) return;

      const result = await getTelegramConnection();
      if (cancelled || !result.success) return;

      setTelegramState(result.data);
    }

    const interval = window.setInterval(refreshConnection, TELEGRAM_POLL_INTERVAL_MS);
    void refreshConnection();

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [expiresAt, step, telegramState.connection?.status]);

  useEffect(() => {
    if (step !== "telegram") return;
    if (!telegramState.configured) return;
    if (telegramState.connection?.status !== "connected") return;
    if (autoFinishRef.current) return;

    autoFinishRef.current = true;
    setSuccess("Telegram connected. Finishing setup...");

    startTransition(async () => {
      const result = await completeOnboarding();
      if (result.success) {
        router.replace("/");
        return;
      }

      autoFinishRef.current = false;
      setError(result.error);
      setSuccess("");
    });
  }, [router, step, startTransition, telegramState.configured, telegramState.connection?.status]);

  function selectWorkspace(nextWorkspaceType: OnboardingWorkspaceType) {
    setWorkspaceType(nextWorkspaceType);
    setError("");
    setSuccess("");
  }

  function selectGoal(nextGoal: OnboardingPrimaryGoal) {
    setPrimaryGoal(nextGoal);
    setError("");
    setSuccess("");
  }

  function selectFocus(nextFocus: OnboardingFocusArea) {
    setFocusArea(nextFocus);
    setError("");
    setSuccess("");
  }

  function continueFromWelcome() {
    if (!workspaceType) {
      setError("Choose whether you are a solo creator or part of a team.");
      return;
    }

    setError("");
    setSuccess("");

    const formData = new FormData();
    formData.append("step", "welcome");
    formData.append("workspace_type", workspaceType);

    startTransition(async () => {
      const result = await saveOnboardingPreferences(formData);
      if (!result.success) {
        setError(result.error);
        return;
      }

      setStep("preferences");
      setSuccess("Workspace saved");
    });
  }

  function continueFromPreferences() {
    if (!primaryGoal || !focusArea) {
      setError("Choose a primary goal and a focus area.");
      return;
    }

    setError("");
    setSuccess("");

    const formData = new FormData();
    formData.append("step", "preferences");
    formData.append("primary_goal", primaryGoal);
    formData.append("focus_area", focusArea);

    startTransition(async () => {
      const result = await saveOnboardingPreferences(formData);
      if (!result.success) {
        setError(result.error);
        return;
      }

      setStep("telegram");
      setSuccess("Preferences saved");
    });
  }

  function generateTelegramCode() {
    setError("");
    setSuccess("");

    startTransition(async () => {
      const result = await createTelegramConnectionCode();
      if (!result.success) {
        setError(result.error);
        return;
      }

      setCode(result.data.code);
      setExpiresAt(result.data.expiresAt);
      autoFinishRef.current = false;
      pollStartedAtRef.current = Date.now();
      setTelegramState((current) => ({
        ...current,
        configured: true,
        botUrl: result.data.botUrl ?? current.botUrl,
        connection: current.connection
          ? {
              ...current.connection,
              status: "pending",
              verification_code_expires_at: result.data.expiresAt,
              telegram_user_id: null,
              telegram_chat_id: null,
              telegram_username: null,
              first_name: null,
              last_name: null,
              connected_at: null,
              disconnected_at: null,
            }
          : {
              id: "",
              user_id: "",
              telegram_user_id: null,
              telegram_chat_id: null,
              telegram_username: null,
              first_name: null,
              last_name: null,
              status: "pending",
              verification_code_expires_at: result.data.expiresAt,
              connected_at: null,
              disconnected_at: null,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
      }));
      setSuccess("Telegram code generated");
    });
  }

  function finishSetup() {
    if (telegramState.configured && telegramState.connection?.status !== "connected") {
      setError("Open Telegram and send the code before finishing setup.");
      return;
    }

    setError("");
    setSuccess("");

    startTransition(async () => {
      const result = await completeOnboarding();
      if (!result.success) {
        setError(result.error);
        return;
      }

      router.replace("/");
    });
  }

  const completionDisabled =
    telegramState.configured && telegramState.connection?.status !== "connected";
  const continueLabel =
    step === "telegram"
      ? telegramState.configured
        ? telegramState.connection?.status === "connected"
          ? "Enter dashboard"
          : "Waiting for Telegram"
        : "Continue to dashboard"
      : "Continue";

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <section className={styles.leftPane}>
          <div className={styles.headerRow}>
            <div className={styles.brand}>
              <img src="/assets/logo.svg" alt="Nyabag" className={styles.brandLogo} />
              <div>
                <p className={styles.brandName}>Nyabag</p>
                <p className={styles.brandMeta}>Onboarding for {userEmail}</p>
              </div>
            </div>

            <Badge variant="subtle" className={styles.badge}>
              Step {activeStepIndex + 1} of 4
            </Badge>
          </div>

          <div className={styles.hero}>
            <p className={styles.kicker}>Automate your busywork</p>
            <h1 className={styles.title}>{stepTitle}</h1>
            <p className={styles.description}>{stepDescription}</p>
          </div>

          <div className={styles.messageStack} aria-live="polite">
  {error && <div className={styles.error}>{error}</div>}
  {success && <div className={styles.success}>{success}</div>}
</div>

<div className={styles.stepBody}>
  {step === "welcome" && (
    <div className={styles.choiceGroup} role="radiogroup" aria-label="Workspace type">
      {workspaceChoices.map((choice) => {
        const Icon = choice.icon;
        const selected = choiceState(choice.value, workspaceType);

        return (
          <button
            key={choice.value}
            type="button"
            className={cn(styles.choiceCard, selected && styles.choiceCardSelected)}
            onClick={() => selectWorkspace(choice.value)}
            aria-pressed={selected}
          >
            <span className={styles.choiceIcon}>
              <Icon size={18} />
            </span>
            <span className={styles.choiceBody}>
              <span className={styles.choiceTitleRow}>
                <span className={styles.choiceTitle}>{choice.title}</span>
                {selected && <Check size={16} />}
              </span>
              <span className={styles.choiceDescription}>{choice.description}</span>
            </span>
          </button>
        );
      })}
    </div>
  )}

  {step === "preferences" && (
    <div className={styles.preferencesGrid}>
      <section className={styles.preferenceColumn}>
        <p className={styles.sectionLabel}>Primary goal</p>
        <div className={styles.choiceStack} role="radiogroup" aria-label="Primary goal">
          {goalChoices.map((choice) => {
            const Icon = choice.icon;
            const selected = choiceState(choice.value, primaryGoal);

            return (
              <button
                key={choice.value}
                type="button"
                className={cn(
                  styles.choiceCard,
                  styles.goalCard,
                  selected && styles.choiceCardSelected
                )}
                onClick={() => selectGoal(choice.value)}
                aria-pressed={selected}
              >
                <span className={styles.choiceIcon}>
                  <Icon size={18} />
                </span>
                <span className={styles.choiceBody}>
                  <span className={styles.choiceTitleRow}>
                    <span className={styles.choiceTitle}>{choice.title}</span>
                    {selected && <Check size={16} />}
                  </span>
                  <span className={styles.choiceDescription}>{choice.description}</span>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section className={styles.preferenceColumn}>
        <p className={styles.sectionLabel}>Focus area</p>
        <div className={styles.focusGrid} role="radiogroup" aria-label="Focus area">
          {focusChoices.map((choice) => {
            const Icon = choice.icon;
            const selected = choiceState(choice.value, focusArea);

            return (
              <button
                key={choice.value}
                type="button"
                className={cn(styles.focusCard, selected && styles.focusCardSelected)}
                onClick={() => selectFocus(choice.value)}
                aria-pressed={selected}
              >
                <span className={styles.focusIcon}>
                  <Icon size={18} />
                </span>
                <span className={styles.focusText}>
                  <span className={styles.focusTitleRow}>
                    <span className={styles.focusTitle}>{choice.title}</span>
                    {selected && <Check size={15} />}
                  </span>
                  <span className={styles.focusDescription}>{choice.description}</span>
                </span>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  )}

  {step === "telegram" && (
    <div className={styles.telegramPanel}>
      <div className={styles.telegramStatusRow}>
        <Badge variant={telegramState.configured ? "subtle" : "warning"}>
          {telegramState.configured ? "Telegram ready" : "Telegram offline"}
        </Badge>
        {telegramState.connection?.status && (
          <Badge
            variant={
              telegramState.connection.status === "connected"
                ? "success"
                : telegramState.connection.status === "pending"
                  ? "warning"
                  : "subtle"
            }
          >
            {telegramState.connection.status}
          </Badge>
        )}
      </div>

      <div className={styles.telegramCard}>
        <div className={styles.telegramCardHeader}>
          <div className={styles.telegramCardIcon}>
            <Send size={18} />
          </div>
          <div>
            <h2>Connect the Telegram bot</h2>
            <p>Send a verification code from Nyabag to start saving links from chat.</p>
          </div>
        </div>

        {code ? (
          <div className={styles.telegramCodePanel}>
            <span className={styles.codeLabel}>Connection code</span>
            <div className={styles.code}>{code}</div>
            <p className={styles.telegramHint}>
              Open the bot, paste this code, and wait for Nyabag to confirm the link.
            </p>
            {expiresAt && <p className={styles.expiry}>Expires {formatDate(expiresAt)}</p>}
          </div>
        ) : (
          <div className={styles.telegramInstructions}>
            <p>Generate a code, open the bot, and follow the prompt to link your account.</p>
            <ul>
              <li>Open Telegram from the button below.</li>
              <li>Send the generated code to the Nyabag bot.</li>
              <li>Wait for the connection badge to switch to connected.</li>
            </ul>
          </div>
        )}

        <div className={styles.telegramActions}>
          {telegramState.configured && telegramState.connection?.status !== "connected" && (
            <Button type="button" onClick={generateTelegramCode} disabled={isPending}>
              <Bot size={14} />
              {telegramState.connection?.status === "pending" || code
                ? "Regenerate code"
                : "Generate code"}
            </Button>
          )}

          {telegramState.botUrl && telegramState.configured && (
            <Button type="button" variant="outline" asChild>
              <a href={telegramState.botUrl} target="_blank" rel="noreferrer">
                <ArrowUpRight size={14} />
                Open Telegram bot
              </a>
            </Button>
          )}

          <Button
            type="button"
            variant={completionDisabled ? "subtle" : "default"}
            onClick={finishSetup}
            disabled={isPending || (completionDisabled && telegramState.configured)}
          >
            {isPending && step === "telegram" ? (
              <Loader2 size={14} className={styles.spin} />
            ) : (
              <ArrowRight size={14} />
            )}
            {continueLabel}
          </Button>
        </div>
      </div>
    </div>
  )}
</div>

<div className={styles.footer}></div>

          <div className={styles.footer}>
            <div className={styles.progress}>
              {(["welcome", "preferences", "telegram", "complete"] as const).map((item, index) => {
                const active = index <= activeStepIndex;
                return (
                  <div key={item} className={styles.progressItem}>
                    <div className={cn(styles.progressBar, active && styles.progressBarActive)} />
                    <span className={styles.progressLabel}>{progressLabels[item]}</span>
                  </div>
                );
              })}
            </div>

            <div className={styles.footerActions}>
              {step === "welcome" && (
                <Button type="button" onClick={continueFromWelcome} disabled={isPending}>
                  {isPending ? (
                    <Loader2 size={14} className={styles.spin} />
                  ) : (
                    <ArrowRight size={14} />
                  )}
                  Continue
                </Button>
              )}

              {step === "preferences" && (
                <Button type="button" onClick={continueFromPreferences} disabled={isPending}>
                  {isPending ? (
                    <Loader2 size={14} className={styles.spin} />
                  ) : (
                    <ArrowRight size={14} />
                  )}
                  Continue
                </Button>
              )}

              <p className={styles.footerNote}>
                Already have an account? <Link href="/login">Sign in</Link>
              </p>
            </div>
          </div>
        </section>

        <aside className={styles.rightPane} aria-hidden="true">
        <div className={styles.onboardingArtworkFrame}>
    <img
      src="/assets/onboarding-showcase.png"
      alt=""
      className={styles.onboardingArtwork}
    />
  </div>
</aside>

      </div>
    </main>
  );
}
