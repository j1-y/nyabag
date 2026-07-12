import "server-only";

import { cookies } from "next/headers";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { Workspace, WorkspaceContext, WorkspaceRole } from "@/lib/types";

export const ACTIVE_WORKSPACE_COOKIE = "nyabag-active-workspace-id";

type WorkspaceMemberRow = {
  workspace_id: string;
  user_id: string;
  role: WorkspaceRole;
  created_at: string;
};

export type ResolvedWorkspace = {
  workspace: Workspace;
  role: WorkspaceRole;
};

export function canWriteWorkspace(role: WorkspaceRole) {
  return role === "owner" || role === "admin" || role === "member";
}

export function canManageWorkspace(role: WorkspaceRole) {
  return role === "owner" || role === "admin";
}

async function ensurePersonalWorkspace(
  supabase: SupabaseClient,
  userId: string
): Promise<string | null> {
  const { data, error } = await supabase.rpc("ensure_personal_workspace", {
    p_user_id: userId,
  });

  if (error) {
    console.error("[workspaces] Could not ensure Personal workspace:", error.message);
    return null;
  }

  return typeof data === "string" ? data : null;
}

async function listWorkspaceMemberships(
  supabase: SupabaseClient,
  userId: string
): Promise<WorkspaceMemberRow[]> {
  const { data, error } = await supabase
    .from("workspace_members")
    .select("workspace_id,user_id,role,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[workspaces] Could not load memberships:", error.message);
    return [];
  }

  return (data ?? []) as WorkspaceMemberRow[];
}

async function listWorkspacesByIds(
  supabase: SupabaseClient,
  workspaceIds: string[]
): Promise<Workspace[]> {
  if (workspaceIds.length === 0) return [];

  const { data, error } = await supabase
    .from("workspaces")
    .select("*")
    .in("id", workspaceIds)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[workspaces] Could not load workspaces:", error.message);
    return [];
  }

  return (data ?? []) as Workspace[];
}

async function getWorkspaceRows(
  supabase: SupabaseClient,
  userId: string
) {
  let memberships = await listWorkspaceMemberships(supabase, userId);

  if (memberships.length === 0) {
    await ensurePersonalWorkspace(supabase, userId);
    memberships = await listWorkspaceMemberships(supabase, userId);
  }

  const workspaces = await listWorkspacesByIds(
    supabase,
    memberships.map((membership) => membership.workspace_id)
  );
  const workspaceById = new Map(workspaces.map((workspace) => [workspace.id, workspace]));

  const accessible = memberships
    .map((membership) => {
      const workspace = workspaceById.get(membership.workspace_id);
      if (!workspace) return null;
      return { workspace, role: membership.role };
    })
    .filter((item): item is ResolvedWorkspace => Boolean(item));

  return accessible;
}

export async function getWorkspaceContext(
  supabase: SupabaseClient,
  user: User
): Promise<WorkspaceContext> {
  const accessible = await getWorkspaceRows(supabase, user.id);

  if (accessible.length === 0) {
    throw new Error("Unable to resolve workspace");
  }

  const cookieStore = await cookies();
  const cookieWorkspaceId = cookieStore.get(ACTIVE_WORKSPACE_COOKIE)?.value;
  const active =
    accessible.find((item) => item.workspace.id === cookieWorkspaceId) ??
    accessible[0];

  return {
    workspaces: accessible.map((item) => item.workspace),
    activeWorkspace: active.workspace,
    activeWorkspaceRole: active.role,
  };
}

export async function resolveWorkspaceForUser(
  supabase: SupabaseClient,
  userId: string,
  workspaceId?: string | null
): Promise<ResolvedWorkspace | null> {
  const accessible = await getWorkspaceRows(supabase, userId);
  if (accessible.length === 0) return null;

  if (workspaceId) {
    return accessible.find((item) => item.workspace.id === workspaceId) ?? null;
  }

  return accessible[0];
}

