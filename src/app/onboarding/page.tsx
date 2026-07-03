import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserOnboarding, hasCompletedOnboarding } from "@/lib/onboarding";
import { OnboardingWizard } from "@/components/onboarding/OnboardingWizard";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const onboarding = await getUserOnboarding(supabase, user);

  if (hasCompletedOnboarding(onboarding)) {
    redirect("/");
  }

  return <OnboardingWizard userEmail={user.email ?? ""} />;
}
