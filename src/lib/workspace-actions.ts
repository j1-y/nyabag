"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { ACTIVE_WORKSPACE_COOKIE, canManageWorkspace, resolveWorkspaceForUser } from "@/lib/workspaces";
import { workspaceCreateSchema, workspaceSwitchSchema, workspaceUpdateSchema } from "@/lib/validations";
import type { ActionResult, Workspace } from "@/lib/types";

const WORKSPACE_COOKIE_OPTIONS = {
  path: "/",
  sameSite: "lax" as const,
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  maxAge: 60 * 60 * 24 * 365,
};

async function getAuthenticatedUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { supabase, user };
}

async function setWorkspaceCookie(workspaceId: string) {
  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_WORKSPACE_COOKIE, workspaceId, WORKSPACE_COOKIE_OPTIONS);
}

function revalidateWorkspaceRoutes() {
  revalidatePath("/");
  revalidatePath("/canvas");
  revalidatePath("/captures");
  revalidatePath("/folders/inbox");
}

export async function setActiveWorkspace(workspaceId: string): Promise<ActionResult> {
  const parsed = workspaceSwitchSchema.safeParse({ workspaceId });
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid workspace" };
  }

  const { supabase, user } = await getAuthenticatedUser();
  if (!user) return { success: false, error: "Not authenticated" };

  const resolved = await resolveWorkspaceForUser(supabase, user.id, parsed.data.workspaceId);
  if (!resolved) {
    return { success: false, error: "Workspace not found" };
  }

  await setWorkspaceCookie(resolved.workspace.id);
  revalidateWorkspaceRoutes();

  return { success: true, data: undefined };
}

export async function createWorkspace(formData: FormData): Promise<ActionResult<Workspace>> {
  const parsed = workspaceCreateSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") ?? "",
  });

  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid workspace" };
  }

  const { supabase, user } = await getAuthenticatedUser();
  if (!user) return { success: false, error: "Not authenticated" };

  const { data: workspace, error: workspaceError } = await supabase
    .from("workspaces")
    .insert({
      owner_id: user.id,
      name: parsed.data.name,
      description: parsed.data.description ?? "",
    })
    .select("*")
    .single();

  if (workspaceError || !workspace) {
    return { success: false, error: workspaceError?.message ?? "Could not create workspace" };
  }

  const { error: memberError } = await supabase.from("workspace_members").insert({
    workspace_id: workspace.id,
    user_id: user.id,
    role: "owner",
  });

  if (memberError) {
    await supabase.from("workspaces").delete().eq("id", workspace.id).eq("owner_id", user.id);
    return { success: false, error: memberError.message };
  }

  await setWorkspaceCookie(workspace.id);
  revalidateWorkspaceRoutes();

  return { success: true, data: workspace as Workspace };
}

export async function renameWorkspace(formData: FormData): Promise<ActionResult<Workspace>> {
  const parsed = workspaceUpdateSchema.safeParse({
    id: formData.get("id"),
    name: formData.get("name"),
    description: formData.get("description") ?? "",
  });

  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid workspace" };
  }

  const { supabase, user } = await getAuthenticatedUser();
  if (!user) return { success: false, error: "Not authenticated" };

  const resolved = await resolveWorkspaceForUser(supabase, user.id, parsed.data.id);
  if (!resolved || !canManageWorkspace(resolved.role)) {
    return { success: false, error: "Workspace not found" };
  }

  const { data, error } = await supabase
    .from("workspaces")
    .update({
      name: parsed.data.name,
      description: parsed.data.description ?? "",
    })
    .eq("id", parsed.data.id)
    .eq("owner_id", user.id)
    .select("*")
    .single();

  if (error || !data) {
    return { success: false, error: error?.message ?? "Could not rename workspace" };
  }

  revalidateWorkspaceRoutes();
  return { success: true, data: data as Workspace };
}

