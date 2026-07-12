"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { HugeIcon } from "@/components/ui/huge-icon";
import {
  IconAdd,
  IconCheck,
  IconChevronsUpDown,
  IconPencil,
} from "@/components/ui/icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { setActiveWorkspace } from "@/lib/workspace-actions";
import type { Workspace, WorkspaceRole } from "@/lib/types";
import { CreateWorkspaceDialog } from "./CreateWorkspaceDialog";
import { RenameWorkspaceDialog } from "./RenameWorkspaceDialog";

type WorkspaceSwitcherProps = {
  workspaces: Workspace[];
  activeWorkspace: Workspace;
  activeWorkspaceRole: WorkspaceRole;
  collapsed: boolean;
};

function workspaceInitials(name: string) {
  return (
    name
      .split(/[\s_-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "N"
  );
}



function canRename(role: WorkspaceRole) {
  return role === "owner" || role === "admin";
}

export function WorkspaceSwitcher({
  workspaces,
  activeWorkspace,
  activeWorkspaceRole,
  collapsed,
}: WorkspaceSwitcherProps) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const activeInitials = useMemo(
    () => workspaceInitials(activeWorkspace.name),
    [activeWorkspace.name]
  );

  function switchWorkspace(workspaceId: string) {
    if (workspaceId === activeWorkspace.id || isPending) return;

    startTransition(async () => {
      const result = await setActiveWorkspace(workspaceId);
      if (result.success) {
        router.refresh();
      }
    });
  }

  const trigger = (
    <button
      type="button"
      className="dashboard-sidebar-workspace"
      aria-label={`Workspace: ${activeWorkspace.name}`}
    >
      <span className="dashboard-sidebar-workspace-icon" aria-hidden="true">
        {activeInitials}
      </span>
      {!collapsed && (
        <>
          <span className="dashboard-sidebar-workspace-copy">
            <small>Workspace</small>
            <strong>{activeWorkspace.name}</strong>
          </span>
          <HugeIcon icon={IconChevronsUpDown} size={18} aria-hidden="true" />
        </>
      )}
    </button>
  );

  return (
    <>
      <DropdownMenu>
        {collapsed ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={10}>
              {activeWorkspace.name}
            </TooltipContent>
          </Tooltip>
        ) : (
          <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
        )}

        <DropdownMenuContent
          side={collapsed ? "right" : "bottom"}
          align="start"
          className="w-64"
        >
          <DropdownMenuLabel>Workspace</DropdownMenuLabel>
          {workspaces.map((workspace) => {
            const active = workspace.id === activeWorkspace.id;
            return (
              <DropdownMenuItem
                key={workspace.id}
                onSelect={(event) => {
                  event.preventDefault();
                  switchWorkspace(workspace.id);
                }}
                className="justify-between"
              >
                <span className="min-w-0 truncate">{workspace.name}</span>
                {active && <HugeIcon icon={IconCheck} size={18} aria-hidden="true" />}
              </DropdownMenuItem>
            );
          })}

          <DropdownMenuSeparator />



          <DropdownMenuItem
            onSelect={(event) => {
              event.preventDefault();
              setCreateOpen(true);
            }}
          >
            <HugeIcon icon={IconAdd} size={18} aria-hidden="true" />
            New workspace
          </DropdownMenuItem>

          {canRename(activeWorkspaceRole) && (
            <DropdownMenuItem
              onSelect={(event) => {
                event.preventDefault();
                setRenameOpen(true);
              }}
            >
              <HugeIcon icon={IconPencil} size={18} aria-hidden="true" />
              Rename workspace
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <CreateWorkspaceDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() => router.refresh()}
      />
      <RenameWorkspaceDialog
        open={renameOpen}
        onOpenChange={setRenameOpen}
        workspace={activeWorkspace}
        onRenamed={() => router.refresh()}
      />
    </>
  );
}

