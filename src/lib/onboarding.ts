import type { User } from "@supabase/supabase-js";
import type { createClient } from "@/lib/supabase/server";
import type { OnboardingStep, UserOnboarding } from "@/lib/types";

type Supabase = Awaited<ReturnType<typeof createClient>>;

const DEFAULT_ONBOARDING: UserOnboarding = {
  user_id: "",
  workspace_id: "",
  workspace_type: "",
  primary_goal: "",
  focus_area: "",
  current_step: "welcome",
  completed_at: null,
  created_at: "",
  updated_at: "",
};

export function hasCompletedOnboarding(onboarding: UserOnboarding | null) {
  return Boolean(onboarding?.completed_at);
}

export function onboardingStepFromRecord(
  onboarding: UserOnboarding | null,
  _profileName: string,
  telegramConnected: boolean
): OnboardingStep {
  if (onboarding?.completed_at) return "complete";
  if (!onboarding?.workspace_type) return "welcome";
  if (!onboarding?.primary_goal || !onboarding?.focus_area) return "preferences";
  if (!telegramConnected) return "telegram";
  return onboarding.current_step === "complete" ? "complete" : "telegram";
}

export async function getUserOnboarding(
  supabase: Supabase,
  user: User
): Promise<UserOnboarding> {
  const { data, error } = await supabase
    .from("user_onboarding")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error || !data) {
    return {
      ...DEFAULT_ONBOARDING,
      user_id: user.id,
    };
  }

  return data as UserOnboarding;
}
