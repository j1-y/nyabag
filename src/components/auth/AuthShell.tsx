import Image from "next/image";
import type { ReactNode } from "react";

import { HugeIcon } from "@/components/ui/huge-icon";
import { IconSparkles } from "@/components/ui/icons";

type AuthShellProps = {
  eyebrow: string;
  title: string;
  subtitle: string;
  visualTitle: string;
  visualCopy: string;
  children?: ReactNode;
};

export function AuthShell({
  eyebrow,
  title,
  subtitle,
  visualTitle,
  visualCopy,
  children,
}: AuthShellProps) {
  return (
    <main className="auth-page">
      <section className="auth-shell" aria-labelledby="auth-heading">
        <div className="auth-visual" aria-hidden="true">
          <Image
            className="auth-visual-image"
            src="/assets/auth-visual.webp"
            alt=""
            width={800}
            height={1000}
            priority
            sizes="(max-width: 720px) 100vw, 44vw"
          />
          <div className="auth-visual-wash" />
          <div className="auth-visual-brand">
            <HugeIcon icon={IconSparkles} size={24} />
            <span>Nyabag</span>
          </div>
          <div className="auth-visual-copy">
            <span className="auth-visual-kicker">Your visual memory, always close.</span>
            <h2>{visualTitle}</h2>
            <p>{visualCopy}</p>
          </div>
        </div>

        <div className="auth-panel">
          <div className="auth-panel-inner">
            <Image
              className="auth-logo"
              src="/assets/logo.svg"
              alt="Nyabag"
              width={594}
              height={118}
              priority
            />
            <div className="auth-heading-block">
              <span className="auth-eyebrow">{eyebrow}</span>
              <h1 id="auth-heading" className="auth-title">
                {title}
              </h1>
              <p className="auth-subtitle">{subtitle}</p>
            </div>
            {children}
          </div>
        </div>
      </section>
    </main>
  );
}
