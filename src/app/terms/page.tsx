import type { Metadata } from "next";
import Link from "next/link";
import styles from "../privacy/privacy.module.css";

const TERMS_URL = "https://app.nyabag.com/terms";
const CONTACT_EMAIL = "privacy@nyabag.com";

export const metadata: Metadata = {
  title: "Terms of Service - Nyabag",
  description:
    "Read the Nyabag Terms of Service for using Nyabag, a visual memory system for designers.",
  alternates: {
    canonical: TERMS_URL,
  },
  openGraph: {
    title: "Terms of Service - Nyabag",
    description:
      "Terms for using Nyabag, a visual memory system for designers to save, organize, and rediscover creative inspiration.",
    url: TERMS_URL,
    siteName: "Nyabag",
    images: [
      {
        url: "/opengraph-image.png",
        width: 1200,
        height: 630,
        alt: "Nyabag Terms of Service",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Terms of Service - Nyabag",
    description:
      "Terms for using Nyabag, a visual memory system for designers.",
    images: ["/opengraph-image.png"],
  },
};

const toc = [
  ["acceptance", "1. Acceptance of these Terms"],
  ["service", "2. The Nyabag service"],
  ["accounts", "3. Accounts and security"],
  ["early-access", "4. Early access"],
  ["acceptable-use", "5. Acceptable use"],
  ["user-content", "6. Your content"],
  ["ip", "7. Nyabag intellectual property"],
  ["third-party", "8. Third-party services"],
  ["availability", "9. Availability and changes"],
  ["disclaimers", "10. Disclaimers"],
  ["liability", "11. Limitation of liability"],
  ["termination", "12. Termination"],
  ["changes", "13. Changes to these Terms"],
  ["owner", "14. Owner identity"],
  ["contact", "15. Contact"],
] as const;

export default function TermsPage() {
  return (
    <div className={styles.root}>
      <header className={styles.hero}>
        <div className={styles.container}>
          <p className={styles.eyebrow}>Terms of Service</p>
          <h1 className={styles.title}>Terms for using Nyabag.</h1>
          <p className={styles.updated}>Last updated June 03, 2026</p>
          <p className={styles.intro}>
            These Terms of Service describe the rules and expectations for using
            Nyabag, a visual memory system for designers created and operated by
            Jayanth Kumar R V.
          </p>
        </div>
      </header>

      <div className={`${styles.container} ${styles.shell}`}>
        <aside className={styles.toc} aria-label="Terms of Service table of contents">
          <h2 className={styles.tocTitle}>Contents</h2>
          <ol className={styles.tocList}>
            {toc.map(([id, label]) => (
              <li key={id}>
                <Link href={`#${id}`}>{label}</Link>
              </li>
            ))}
          </ol>
        </aside>

        <main className={styles.content}>
          <section id="acceptance" className={styles.section}>
            <h2>1. Acceptance of These Terms</h2>
            <p>
              By accessing or using Nyabag, you agree to these Terms of Service
              and to the Nyabag Privacy Policy. If you do not agree to these
              Terms, you should not use the service.
            </p>
            <p>
              In these Terms, &quot;Nyabag,&quot; &quot;we,&quot; &quot;us,&quot; and
              &quot;our&quot; refer to Jayanth Kumar R V operating the Nyabag
              software product. &quot;You&quot; refers to the person or entity using
              the service.
            </p>
          </section>

          <section id="service" className={styles.section}>
            <h2>2. The Nyabag Service</h2>
            <p>
              Nyabag is a design-focused software product that helps users save,
              organize, and rediscover websites, screenshots, UI references,
              color palettes, fonts, notes, and creative inspiration.
            </p>
            <p>
              Nyabag is not a handbag store, backpack shop, ecommerce marketplace,
              fashion brand, or retail product. It is a software service for
              designers and visual thinkers.
            </p>
          </section>

          <section id="accounts" className={styles.section}>
            <h2>3. Accounts and Security</h2>
            <p>
              Some features may require an account. You are responsible for the
              accuracy of the information you provide and for maintaining the
              confidentiality of your account credentials.
            </p>
            <p>
              You agree to notify us if you believe your account has been
              accessed without permission or if you notice suspicious activity.
            </p>
          </section>

          <section id="early-access" className={styles.section}>
            <h2>4. Early Access</h2>
            <p>
              Nyabag is currently an early-stage product. Early access features
              may change, be limited, contain bugs, or be unavailable at times.
            </p>
            <p>
              We may invite, pause, limit, or remove early access at our
              discretion as we develop the product and learn from users.
            </p>
          </section>

          <section id="acceptable-use" className={styles.section}>
            <h2>5. Acceptable Use</h2>
            <p>You agree not to misuse Nyabag or help anyone else misuse it. This includes:</p>
            <ul>
              <li>Trying to access accounts, data, systems, or areas you are not allowed to access.</li>
              <li>Uploading malicious code, spam, or content that disrupts the service.</li>
              <li>Using Nyabag to infringe intellectual property, privacy, or other rights.</li>
              <li>Scraping, reverse engineering, or overloading the service in a way that harms Nyabag or other users.</li>
              <li>Using the service for unlawful, abusive, or deceptive activity.</li>
            </ul>
          </section>

          <section id="user-content" className={styles.section}>
            <h2>6. Your Content</h2>
            <p>
              You keep ownership of the links, notes, screenshots, tags, files,
              and other materials you add to Nyabag. By adding content, you give
              Nyabag permission to store, process, display, and use that content
              as needed to provide and improve the service.
            </p>
            <p>
              You are responsible for making sure you have the rights needed to
              save, upload, or use content in Nyabag.
            </p>
          </section>

          <section id="ip" className={styles.section}>
            <h2>7. Nyabag Intellectual Property</h2>
            <p>
              Nyabag, including its name, branding, product design, interface,
              code, and original content, is owned by Jayanth Kumar R V or its
              applicable licensors.
            </p>
            <p>
              These Terms do not grant you ownership of Nyabag or permission to
              copy, resell, reproduce, or create derivative products from Nyabag
              except as allowed by law or with written permission.
            </p>
          </section>

          <section id="third-party" className={styles.section}>
            <h2>8. Third-Party Services</h2>
            <p>
              Nyabag may rely on third-party services for hosting, authentication,
              analytics, email, screenshots, metadata, storage, or other product
              functionality.
            </p>
            <p>
              Third-party websites, links, and services are governed by their own
              terms and policies. Nyabag is not responsible for third-party
              content or services outside our control.
            </p>
          </section>

          <section id="availability" className={styles.section}>
            <h2>9. Availability and Changes</h2>
            <p>
              We aim to keep Nyabag useful and available, but we do not guarantee
              uninterrupted or error-free operation. The service may change as we
              add, remove, improve, or test features.
            </p>
          </section>

          <section id="disclaimers" className={styles.section}>
            <h2>10. Disclaimers</h2>
            <p>
              Nyabag is provided on an &quot;as is&quot; and &quot;as available&quot;
              basis. To the maximum extent permitted by law, we disclaim warranties
              of merchantability, fitness for a particular purpose, non-infringement,
              and any warranties arising from course of dealing or usage of trade.
            </p>
          </section>

          <section id="liability" className={styles.section}>
            <h2>11. Limitation of Liability</h2>
            <p>
              To the maximum extent permitted by law, Nyabag and its creator will
              not be liable for indirect, incidental, special, consequential, or
              punitive damages, or for loss of data, profits, goodwill, or business
              opportunities resulting from your use of the service.
            </p>
          </section>

          <section id="termination" className={styles.section}>
            <h2>12. Termination</h2>
            <p>
              You may stop using Nyabag at any time. We may suspend or terminate
              access if we believe you have violated these Terms, created risk for
              Nyabag or other users, or used the service unlawfully.
            </p>
          </section>

          <section id="changes" className={styles.section}>
            <h2>13. Changes to These Terms</h2>
            <p>
              We may update these Terms as Nyabag evolves. When we make changes,
              we will update the date at the top of this page. Your continued use
              of Nyabag after changes become effective means you accept the updated
              Terms.
            </p>
          </section>

          <section id="owner" className={styles.section}>
            <h2>14. Owner Identity</h2>
            <p>
              Nyabag is independently created, owned, and operated by Jayanth Kumar
              R V. Nyabag is not owned by or connected to any external bag store,
              ecommerce brand, fashion retailer, or older product using a similar
              name.
            </p>
          </section>

          <section id="contact" className={styles.section}>
            <h2>15. Contact</h2>
            <p>
              If you have questions about these Terms, contact us at{" "}
              <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
            </p>
          </section>
        </main>
      </div>
    </div>
  );
}
