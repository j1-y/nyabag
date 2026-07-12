"use client";

import { HugeIcon, type IconSvgElement } from "@/components/ui/huge-icon";
import { IconArrowLeft, IconArrowRight, IconBookmark, IconCamera, IconFile, IconLogout, IconUser } from "@/components/ui/icons";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "@/lib/actions";
import { FolderTree } from "@/components/folders/FolderTree";
import { WorkspaceSwitcher } from "@/components/workspaces/WorkspaceSwitcher";
import type { BookmarkFolder, Workspace, WorkspaceRole } from "@/lib/types";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// ─── Types ───────────────────────────────────────────────────

type DashboardSidebarProps = {
  collapsed: boolean;
  onToggle: () => void;
  userEmail: string;
  profileName: string;
  profileAvatarUrl: string | null;
  folders: BookmarkFolder[];
  workspaces: Workspace[];
  activeWorkspace: Workspace;
  activeWorkspaceRole: WorkspaceRole;
};

type NavItem = {
  href?: string;
  label: string;
  icon: IconSvgElement;
  match: (pathname: string) => boolean;
  comingSoon?: boolean;
};

// ─── Nav config ──────────────────────────────────────────────

const NAV_ITEMS: NavItem[] = [
  {
    href: "/",
    label: "Bookmarks",
    icon: IconBookmark,
    match: (p) =>
      p === "/" ||
      p.startsWith("/bookmarks") ||
      p.startsWith("/folders"),
  },
  {
    href: "/canvas",
    label: "Canvas",
    icon: IconFile,
    match: (p) => p.startsWith("/canvas"),
  },
  {
    href: "/captures",
    label: "Captures",
    icon: IconCamera,
    match: (p) => p.startsWith("/captures"),
  },
];

// ─── Helpers ─────────────────────────────────────────────────

function initials(name: string, email: string) {
  const source = name.trim() || email.trim();
  if (!source) return "N";
  return (
    source
      .split(/[.@\s_-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "N"
  );
}

// ─── Component ───────────────────────────────────────────────

export function DashboardSidebar({
  collapsed,
  onToggle,
  userEmail,
  profileName,
  profileAvatarUrl,
  folders,
  workspaces,
  activeWorkspace,
  activeWorkspaceRole,
}: DashboardSidebarProps) {
  const pathname = usePathname();
  const displayName = profileName.trim() || userEmail || "Profile";
  const userInitials = initials(profileName, userEmail);

  return (
    <TooltipProvider delayDuration={300}>
      <aside className="dashboard-sidebar" aria-label="App navigation">
        {/* ── Header ── */}
        <div className="dashboard-sidebar-header">
          <Link
            href="/"
            className="dashboard-sidebar-brand"
            aria-label="Nyabag home"
          >
            <span className="dashboard-sidebar-logo" aria-hidden="true" />
          </Link>
          <button
            type="button"
            className="sidebar-collapse-btn"
            onClick={onToggle}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? (
              <HugeIcon icon={IconArrowRight} size={18} />
            ) : (
              <HugeIcon icon={IconArrowLeft} size={18} />
            )}
          </button>
        </div>

        {/* ── Nav ── */}
        <WorkspaceSwitcher
          workspaces={workspaces}
          activeWorkspace={activeWorkspace}
          activeWorkspaceRole={activeWorkspaceRole}
          collapsed={collapsed}
        />

        <nav
          className="dashboard-sidebar-scroll"
          aria-label="Primary navigation"
        >
          <div className="dashboard-sidebar-section">
            {!collapsed && (
              <p className="dashboard-sidebar-label">Workspace</p>
            )}

            {NAV_ITEMS.map((item) => {
              const ItemIcon = item.icon;
              const active = item.match(pathname);
              const itemLabel = item.comingSoon ? `${item.label} - Coming soon` : item.label;
              const itemClassName = `dashboard-sidebar-item${active ? " active" : ""}${
                item.comingSoon ? " dashboard-sidebar-item-disabled" : ""
              }`;

              const itemContent = (
                <>
                  <HugeIcon
                    icon={ItemIcon}
                    size={18}
                    className="dashboard-sidebar-item-icon"
                    aria-hidden="true"
                  />
                  <span className="dashboard-sidebar-item-copy">
                    <span>{item.label}</span>
                    {item.comingSoon && (
                      <span className="sidebar-coming-soon-badge">Coming soon</span>
                    )}
                  </span>
                </>
              );

              const navEl = item.href ? (
                <Link
                  key={item.label}
                  href={item.href}
                  className={itemClassName}
                  aria-label={collapsed ? itemLabel : undefined}
                  aria-current={active ? "page" : undefined}
                >
                  {itemContent}
                </Link>
              ) : (
                <button
                  key={item.label}
                  type="button"
                  className={itemClassName}
                  aria-disabled="true"
                  aria-label={collapsed ? itemLabel : undefined}
                  tabIndex={-1}
                >
                  {itemContent}
                </button>
              );

              if (collapsed) {
                return (
                  <Tooltip key={item.label}>
                    <TooltipTrigger asChild>{navEl}</TooltipTrigger>
                    <TooltipContent side="right" sideOffset={10}>
                      {itemLabel}
                    </TooltipContent>
                  </Tooltip>
                );
              }

              return navEl;
            })}
          </div>

          {/* Folders section — only shown expanded */}
          {!collapsed && (
            <div className="dashboard-sidebar-folders">
              <FolderTree folders={folders} collapsed={collapsed} />
            </div>
          )}
        </nav>

        {/* ── Profile footer ── */}
        <div className="dashboard-sidebar-profile">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="sidebar-profile-trigger"
                aria-label={
                  collapsed ? `Open menu for ${displayName}` : undefined
                }
                title={collapsed ? displayName : undefined}
              >
                <span className="profile-avatar" aria-hidden="true">
                  {profileAvatarUrl ? (
                    <span
                      className="profile-avatar-image"
                      style={{
                        backgroundImage: `url(${profileAvatarUrl})`,
                      }}
                    />
                  ) : (
                    userInitials
                  )}
                </span>
                <span className="sidebar-profile-copy">
                  <strong>{displayName}</strong>
                  <small>{userEmail || "Personal"}</small>
                </span>
              </button>
            </DropdownMenuTrigger>

            <DropdownMenuContent
              side={collapsed ? "right" : "top"}
              align={collapsed ? "start" : "start"}
              sideOffset={6}
              className="sidebar-profile-menu-content"
            >
              <DropdownMenuItem asChild>
                <Link
                  href="/profile"
                  className="sidebar-profile-menu-row sidebar-profile-menu-link"
                >
                  <HugeIcon icon={IconUser} size={18} aria-hidden="true" />
                  Profile
                </Link>
              </DropdownMenuItem>

              <form action={signOut} className="sidebar-profile-menu-form">
                <DropdownMenuItem asChild>
                  <button
                    type="submit"
                    className="sidebar-profile-menu-row sidebar-profile-menu-danger"
                  >
                    <HugeIcon icon={IconLogout} size={18} aria-hidden="true" />
                    Log out
                  </button>
                </DropdownMenuItem>
              </form>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>
    </TooltipProvider>
  );
}
