"use server";

import { revalidatePath } from "next/cache";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult, UserOnboarding } from "@/lib/types";
import {
  onboardingFocusAreaSchema,
  onboardingPrimaryGoalSchema,
  onboardingWorkspaceTypeSchema,
} from "@/lib/validations";

type Supabase = Awaited<ReturnType<typeof createClient>>;

async function getAuthenticatedUser(supabase: Supabase): Promise<User | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ?? null;
}

async function getExistingOnboarding(
  supabase: Supabase,
  userId: string
): Promise<UserOnboarding | null> {
  const { data, error } = await supabase
    .from("user_onboarding")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) return null;
  return (data as UserOnboarding | null) ?? null;
}

function onboardingError(message: string): ActionResult<UserOnboarding> {
  return { success: false, error: message };
}

export async function saveOnboardingPreferences(
  formData: FormData
): Promise<ActionResult<UserOnboarding>> {
  const step = String(formData.get("step") ?? "");
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);

  if (!user) {
    return onboardingError("Not authenticated");
  }

  const existing = await getExistingOnboarding(supabase, user.id);
  const now = new Date().toISOString();

  let payload: Partial<UserOnboarding> = {
    user_id: user.id,
    updated_at: now,
  };

  if (step === "welcome") {
    const parsed = onboardingWorkspaceTypeSchema.safeParse(
      formData.get("workspace_type")
    );

    if (!parsed.success) {
      return onboardingError("Choose whether you are a solo creator or a team.");
    }

    payload = {
      ...payload,
      workspace_type: parsed.data,
      primary_goal: existing?.primary_goal ?? "",
      focus_area: existing?.focus_area ?? "",
      current_step: "preferences",
    };
  } else if (step === "preferences") {
    const goal = onboardingPrimaryGoalSchema.safeParse(
      formData.get("primary_goal")
    );
    const focus = onboardingFocusAreaSchema.safeParse(
      formData.get("focus_area")
    );

    if (!goal.success || !focus.success) {
      return onboardingError("Pick a primary goal and focus area.");
    }

    payload = {
      ...payload,
      workspace_type: existing?.workspace_type ?? "",
      primary_goal: goal.data,
      focus_area: focus.data,
      current_step: "telegram",
    };
  } else {
    return onboardingError("Invalid onboarding step.");
  }

  const { data, error } = await supabase
    .from("user_onboarding")
    .upsert(
      {
        user_id: user.id,
        workspace_type: payload.workspace_type ?? existing?.workspace_type ?? "",
        primary_goal: payload.primary_goal ?? existing?.primary_goal ?? "",
        focus_area: payload.focus_area ?? existing?.focus_area ?? "",
        current_step: payload.current_step ?? existing?.current_step ?? "welcome",
        completed_at: existing?.completed_at ?? null,
        updated_at: now,
      },
      { onConflict: "user_id" }
    )
    .select()
    .single();

  if (error) {
    return onboardingError(error.message);
  }

  revalidatePath("/onboarding");
  revalidatePath("/");
  revalidatePath("/profile");

  return { success: true, data: data as UserOnboarding };
}

export async function completeOnboarding(): Promise<ActionResult<UserOnboarding>> {
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);

  if (!user) {
    return onboardingError("Not authenticated");
  }

  const existing = await getExistingOnboarding(supabase, user.id);
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("user_onboarding")
    .upsert(
      {
        user_id: user.id,
        workspace_type: existing?.workspace_type ?? "",
        primary_goal: existing?.primary_goal ?? "",
        focus_area: existing?.focus_area ?? "",
        current_step: "complete",
        completed_at: now,
        updated_at: now,
      },
      { onConflict: "user_id" }
    )
    .select()
    .single();

  if (error) {
    return onboardingError(error.message);
  }

  revalidatePath("/onboarding");
  revalidatePath("/");
  revalidatePath("/profile");

  return { success: true, data: data as UserOnboarding };
}
