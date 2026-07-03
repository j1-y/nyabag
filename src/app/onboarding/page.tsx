import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserProfile } from "@/lib/profile";
import {
  getUserOnboarding,
  hasCompletedOnboarding,
  onboardingStepFromRecord,
} from "@/lib/onboarding";
import { getTelegramConnection } from "@/lib/actions";
import { OnboardingWizard } from "@/components/onboarding/OnboardingWizard";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const [profile, onboarding, telegramResult] = await Promise.all([
    getUserProfile(supabase, user),
    getUserOnboarding(supabase, user),
    getTelegramConnection(),
  ]);

  if (hasCompletedOnboarding(onboarding)) {
    redirect("/");
  }

  const telegramState = telegramResult.success
    ? telegramResult.data
    : { configured: false, connection: null };

  const initialStep = onboardingStepFromRecord(
    onboarding,
    profile.name,
    telegramState.connection?.status === "connected"
  );

  return (
    <OnboardingWizard
      userEmail={user.email ?? ""}
      initialStep={initialStep}
      initialWorkspaceType={onboarding.workspace_type ?? ""}
      initialPrimaryGoal={onboarding.primary_goal ?? ""}
      initialFocusArea={onboarding.focus_area ?? ""}
      telegram={telegramState}
    />
  );
}
