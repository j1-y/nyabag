"use client";

import { useCallback, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { DashboardSidebar } from "./DashboardSidebar";
import { MobileBookmarkCapture } from "./MobileBookmarkCapture";
import type { BookmarkFolder } from "@/lib/types";

type DashboardShellProps = {
  children: React.ReactNode;
  userEmail: string;
  profileName: string;
  profileAvatarUrl: string | null;
  folders: BookmarkFolder[];
};

const SIDEBAR_KEY = "nyabag-sidebar-collapsed";
const SIDEBAR_EVENT = "nyabag-sidebar-collapsed-change";
const MOBILE_BREAKPOINT = 768;
const LAPTOP_COLLAPSE_BREAKPOINT = 1180;

function getStoredSidebarState() {
  if (typeof window === "undefined") return false;
  const stored = window.localStorage.getItem(SIDEBAR_KEY);
  return stored ? stored === "true" : window.innerWidth <= MOBILE_BREAKPOINT;
}

function getServerSidebarState() {
  return false;
}

function subscribeToSidebarState(onStoreChange: () => void) {
  if (typeof window === "undefined") return () => {};

  window.addEventListener("storage", onStoreChange);
  window.addEventListener(SIDEBAR_EVENT, onStoreChange);

  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(SIDEBAR_EVENT, onStoreChange);
  };
}

function getMobileState() {
  if (typeof window === "undefined") return false;
  return window.innerWidth <= MOBILE_BREAKPOINT;
}

function getCompactViewportState() {
  if (typeof window === "undefined") return false;
  return window.innerWidth <= LAPTOP_COLLAPSE_BREAKPOINT;
}

function getServerMobileState() {
  return false;
}

function subscribeToMobileState(onStoreChange: () => void) {
  if (typeof window === "undefined") return () => {};

  window.addEventListener("resize", onStoreChange);
  return () => window.removeEventListener("resize", onStoreChange);
}

export function DashboardShell({
  children,
  userEmail,
  profileName,
  profileAvatarUrl,
  folders,
}: DashboardShellProps) {
  const pathname = usePathname();
  const collapsed = useSyncExternalStore(
    subscribeToSidebarState,
    getStoredSidebarState,
    getServerSidebarState
  );
  const isMobile = useSyncExternalStore(
    subscribeToMobileState,
    getMobileState,
    getServerMobileState
  );
  const isCompactViewport = useSyncExternalStore(
    subscribeToMobileState,
    getCompactViewportState,
    getServerMobileState
  );
  const effectiveCollapsed = collapsed || isCompactViewport;

  const toggleSidebar = useCallback(() => {
    const next = !getStoredSidebarState();
    window.localStorage.setItem(SIDEBAR_KEY, String(next));
    window.dispatchEvent(new Event(SIDEBAR_EVENT));
  }, []);

  return isMobile && pathname === "/" ? (
    <MobileBookmarkCapture
      profileName={profileName}
      userEmail={userEmail}
      profileAvatarUrl={profileAvatarUrl}
    />
  ) : (
    <div className={`app-layout ${effectiveCollapsed ? "sidebar-collapsed" : ""}`}>
      <DashboardSidebar
        collapsed={effectiveCollapsed}
        onToggle={toggleSidebar}
        userEmail={userEmail}
        profileName={profileName}
        profileAvatarUrl={profileAvatarUrl}
        folders={folders}
      />
      <div className="main-content">
        {children}
      </div>
    </div>
  );
}
