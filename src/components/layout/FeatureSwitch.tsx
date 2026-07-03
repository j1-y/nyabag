"use client";

import { FileText, Loader2, Grid } from "lucide-react";
import Link from "next/link";
import { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";

function FeatureSwitchLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link href={href} className={`feature-switch-item ${active ? "active" : ""}`}>
      <FeatureSwitchLinkInner>{children}</FeatureSwitchLinkInner>
    </Link>
  );
}

function FeatureSwitchLinkInner({ children }: { children: React.ReactNode }) {
  const { pending } = useLinkStatus();

  return (
    <>
      <span className="feature-switch-copy">{children}</span>
      {pending && <Loader2 className="feature-switch-spinner" size={13} aria-hidden="true" />}
    </>
  );
}

export function FeatureSwitch() {
  const pathname = usePathname();
  const isNotes = pathname.startsWith("/canvas");

  return (
    <nav className="feature-switch" aria-label="Primary">
      <FeatureSwitchLink href="/" active={!isNotes}>
        <Grid size={14} />
        Bookmarks
      </FeatureSwitchLink>
      <FeatureSwitchLink href="/canvas" active={isNotes}>
        <FileText size={14} />
        Canvas
      </FeatureSwitchLink>
    </nav>
  );
}
