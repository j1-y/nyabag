"use client";

import { Bookmark, Camera, ChevronLeft, ArrowRight, ChevronsUpDown, FileText, Palette, LogOut, User, LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "@/lib/actions";
import { FolderTree } from "@/components/folders/FolderTree";
import type { BookmarkFolder } from "@/lib/types";
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
  DropdownMenuLabel,
  DropdownMenuSeparator,
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
};

type NavItem = {
  href?: string;
  label: string;
  icon: LucideIcon;
  match: (pathname: string) => boolean;
  comingSoon?: boolean;
};

// ─── Nav config ──────────────────────────────────────────────

const NAV_ITEMS: NavItem[] = [
  {
    href: "/",
    label: "Bookmarks",
    icon: Bookmark,
    match: (p) =>
      p === "/" ||
      p.startsWith("/bookmarks") ||
      p.startsWith("/folders"),
  },
  {
    href: "/canvas",
    label: "Canvas",
    icon: FileText,
    match: (p) => p.startsWith("/canvas"),
  },
  {
    label: "Design DNA",
    icon: Palette,
    match: () => false,
    comingSoon: true,
  },
  {
    href: "/captures",
    label: "Captures",
    icon: Camera,
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
              <ArrowRight size={16} />
            ) : (
              <ChevronLeft size={16} />
            )}
          </button>
        </div>

        {/* ── Nav ── */}
        {!collapsed && (
          <div className="dashboard-sidebar-workspace" aria-label="Personal Nyabag workspace">
            <span className="dashboard-sidebar-workspace-icon" aria-hidden="true">
              {userInitials}
            </span>
            <span className="dashboard-sidebar-workspace-copy">
              <small>Personal workspace</small>
              <strong>{displayName}</strong>
            </span>
          </div>
        )}

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
                  <ItemIcon
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
                <ChevronsUpDown
                  size={15}
                  className="sidebar-profile-settings"
                  aria-hidden="true"
                />
              </button>
            </DropdownMenuTrigger>

            <DropdownMenuContent
              side={collapsed ? "right" : "top"}
              align={collapsed ? "start" : "start"}
              sideOffset={8}
              className="sidebar-profile-menu-content"
            >
              {/* Account summary */}
              <DropdownMenuLabel className="sidebar-profile-menu-summary">
                <span className="profile-avatar profile-avatar-lg" aria-hidden="true">
                  {profileAvatarUrl ? (
                    <span
                      className="profile-avatar-image"
                      style={{ backgroundImage: `url(${profileAvatarUrl})` }}
                    />
                  ) : (
                    userInitials
                  )}
                </span>
                <div className="sidebar-profile-menu-info">
                  <strong>{displayName}</strong>
                  <span>{userEmail}</span>
                </div>
              </DropdownMenuLabel>

              <DropdownMenuSeparator />

              <DropdownMenuItem asChild>
                <Link href="/profile" className="sidebar-profile-menu-link">
                  <User size={15} aria-hidden="true" />
                  Profile
                </Link>
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              <DropdownMenuItem asChild>
                <form action={signOut} className="sidebar-profile-menu-form">
                  <button
                    type="submit"
                    className="sidebar-profile-menu-danger"
                  >
                    <LogOut size={15} aria-hidden="true" />
                    Log out
                  </button>
                </form>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>
    </TooltipProvider>
  );
}
