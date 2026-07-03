import type { Metadata } from "next";
import Link from "next/link";
import styles from "./privacy.module.css";

export const metadata: Metadata = {
  title: "Privacy Policy - Nyabag",
  description:
    "Read the Nyabag Privacy Policy to understand how Nyabag collects, uses, shares, and protects personal information.",
  alternates: {
    canonical: "https://app.nyabag.com/privacy",
  },
  openGraph: {
    title: "Privacy Policy - Nyabag",
    description:
      "How Nyabag collects, uses, shares, and protects personal information.",
    url: "https://app.nyabag.com/privacy",
    siteName: "Nyabag",
    images: [
      {
        url: "/opengraph-image.png",
        width: 1200,
        height: 630,
        alt: "Nyabag Privacy Policy",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Privacy Policy - Nyabag",
    description:
      "How Nyabag collects, uses, shares, and protects personal information.",
    images: ["/opengraph-image.png"],
  },
};

const toc = [
  ["infocollect", "1. What information do we collect?"],
  ["infouse", "2. How do we process your information?"],
  ["legalbases", "3. What legal bases do we rely on?"],
  ["whoshare", "4. When and with whom do we share information?"],
  ["cookies", "5. Cookies and tracking technologies"],
  ["ai", "6. AI-based products"],
  ["inforetain", "7. How long do we keep your information?"],
  ["infosafe", "8. How do we keep your information safe?"],
  ["infominors", "9. Do we collect information from minors?"],
  ["privacyrights", "10. What are your privacy rights?"],
  ["DNT", "11. Do-Not-Track controls"],
  ["uslaws", "12. United States resident privacy rights"],
  ["policyupdates", "13. Updates to this notice"],
  ["contact", "14. How can you contact us?"],
  ["request", "15. Review, update, or delete your data"],
] as const;

const personalInfoRows = [
  ["A. Identifiers", "Contact details, such as real name, alias, telephone or mobile contact number, unique personal identifier, online identifier, Internet Protocol address, email address, and account name", "NO"],
  ["B. California Customer Records personal information", "Name, contact information, education, employment, employment history, and financial information", "NO"],
  ["C. Protected classification characteristics", "Gender, age, date of birth, race and ethnicity, national origin, marital status, and other demographic data", "NO"],
  ["D. Commercial information", "Transaction information, purchase history, financial details, and payment information", "NO"],
  ["E. Biometric information", "Fingerprints and voiceprints", "NO"],
  ["F. Internet or similar network activity", "Browsing history, search history, online behavior, interest data, and interactions with our and other websites, applications, systems, and advertisements", "NO"],
  ["G. Geolocation data", "Device location", "NO"],
  ["H. Audio, electronic, sensory, or similar information", "Images and audio, video, or call recordings created in connection with our business activities", "NO"],
  ["I. Professional or employment-related information", "Business contact details, job title, work history, and professional qualifications if you apply for a job with us", "NO"],
  ["J. Education information", "Student records and directory information", "NO"],
  ["K. Inferences", "Inferences drawn from collected personal information to create a profile or summary about preferences and characteristics", "NO"],
  ["L. Sensitive personal information", "", "NO"],
] as const;

export default function PrivacyPage() {
  return (
    <div className={styles.root}>
      <header className={styles.hero}>
        <div className={styles.container}>
          <p className={styles.eyebrow}>Privacy Policy</p>
          <h1 className={styles.title}>How Nyabag handles your information.</h1>
          <p className={styles.updated}>Last updated June 02, 2026</p>
          <p className={styles.intro}>
            This Privacy Notice for Jayanth Kumar R V, operating as Nyabag
            (&quot;we,&quot; &quot;us,&quot; or &quot;our&quot;), describes how and why we might
            access, collect, store, use, and/or share your personal information
            when you use our services.
          </p>
        </div>
      </header>

      <div className={`${styles.container} ${styles.shell}`}>
        <aside className={styles.toc} aria-label="Privacy policy table of contents">
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
          <section className={styles.section} aria-labelledby="summary">
            <h2 id="summary">Summary of Key Points</h2>
            <p>
              <strong>What personal information do we process?</strong> When you
              visit, use, or navigate our Services, we may process personal
              information depending on how you interact with us and the
              Services, the choices you make, and the products and features you
              use.
            </p>
            <p>
              <strong>Do we process sensitive personal information?</strong> We
              do not process sensitive personal information.
            </p>
            <p>
              <strong>Do we collect information from third parties?</strong> We
              may collect information from public databases, marketing partners,
              social media platforms, and other outside sources.
            </p>
            <p>
              <strong>How do we process your information?</strong> We process
              your information to provide, improve, and administer our Services,
              communicate with you, for security and fraud prevention, and to
              comply with law.
            </p>
            <p>
              <strong>How do you exercise your rights?</strong> The easiest way
              to exercise your rights is by submitting a{" "}
              <a href="https://app.termly.io/dsar/08c1d124-bf58-48a8-80eb-3e9cd5be759c">
                data subject access request
              </a>{" "}
              or by contacting us at{" "}
              <a href="mailto:privacy@nyabag.com">privacy@nyabag.com</a>.
            </p>
          </section>

          <section id="infocollect" className={styles.section}>
            <h2>1. What Information Do We Collect?</h2>
            <h3>Personal information you disclose to us</h3>
            <p className={styles.short}>
              In Short: We collect personal information that you provide to us.
            </p>
            <p>
              We collect personal information that you voluntarily provide to us
              when you register on the Services, express an interest in
              obtaining information about us or our products and Services, when
              you participate in activities on the Services, or otherwise when
              you contact us.
            </p>
            <p>The personal information we collect may include:</p>
            <ul>
              <li>names</li>
              <li>phone numbers</li>
              <li>email addresses</li>
              <li>passwords</li>
              <li>usernames</li>
            </ul>
            <p>
              <strong>Sensitive Information.</strong> We do not process
              sensitive information. All personal information that you provide to
              us must be true, complete, and accurate, and you must notify us of
              any changes to such personal information.
            </p>
            <h3>Information automatically collected</h3>
            <p className={styles.short}>
              In Short: Some information, such as your Internet Protocol (IP)
              address and/or browser and device characteristics, is collected
              automatically when you visit our Services.
            </p>
            <p>
              We automatically collect certain information when you visit, use,
              or navigate the Services. This information does not reveal your
              specific identity but may include device and usage information,
              such as your IP address, browser and device characteristics,
              operating system, language preferences, referring URLs, device
              name, country, location, information about how and when you use
              our Services, and other technical information.
            </p>
            <ul>
              <li>
                <strong>Log and Usage Data.</strong> Service-related,
                diagnostic, usage, and performance information our servers
                automatically collect when you access or use our Services.
              </li>
              <li>
                <strong>Device Data.</strong> Information about the computer,
                phone, tablet, or other device you use to access the Services.
              </li>
              <li>
                <strong>Location Data.</strong> Information about your device
                location, which can be either precise or imprecise, depending on
                your device settings.
              </li>
            </ul>
            <h3>Google API</h3>
            <p>
              Our use of information received from Google APIs will adhere to
              the{" "}
              <a href="https://developers.google.com/terms/api-services-user-data-policy">
                Google API Services User Data Policy
              </a>
              , including the{" "}
              <a href="https://developers.google.com/terms/api-services-user-data-policy#limited-use">
                Limited Use requirements
              </a>
              .
            </p>
            <h3>Information collected from other sources</h3>
            <p className={styles.short}>
              In Short: We may collect limited data from public databases,
              marketing partners, and other outside sources.
            </p>
            <p>
              We may obtain information from other sources, such as public
              databases, joint marketing partners, affiliate programs, data
              providers, and other third parties. This information may include
              job titles, email addresses, phone numbers, intent data, IP
              addresses, social media profiles, social media URLs, and custom
              profiles, for purposes of targeted advertising and event
              promotion.
            </p>
          </section>

          <section id="infouse" className={styles.section}>
            <h2>2. How Do We Process Your Information?</h2>
            <p className={styles.short}>
              In Short: We process your information to provide, improve, and
              administer our Services, communicate with you, for security and
              fraud prevention, and to comply with law.
            </p>
            <ul>
              <li>
                <strong>
                  To facilitate account creation and authentication and
                  otherwise manage user accounts.
                </strong>{" "}
                We may process your information so you can create and log in to
                your account, as well as keep your account in working order.
              </li>
              <li>
                <strong>To save or protect an individual&apos;s vital interest.</strong>{" "}
                We may process your information when necessary to save or
                protect an individual&apos;s vital interest, such as to prevent
                harm.
              </li>
            </ul>
          </section>

          <section id="legalbases" className={styles.section}>
            <h2>3. What Legal Bases Do We Rely On?</h2>
            <p className={styles.short}>
              In Short: We only process your personal information when we
              believe it is necessary and we have a valid legal reason to do so
              under applicable law.
            </p>
            <h3>If you are located in the EU or UK</h3>
            <ul>
              <li>
                <strong>Consent.</strong> We may process your information if you
                have given us permission to use your personal information for a
                specific purpose. You can withdraw your consent at any time.
              </li>
              <li>
                <strong>Legal Obligations.</strong> We may process your
                information where we believe it is necessary for compliance with
                our legal obligations.
              </li>
              <li>
                <strong>Vital Interests.</strong> We may process your
                information where we believe it is necessary to protect your
                vital interests or the vital interests of a third party.
              </li>
            </ul>
            <h3>If you are located in Canada</h3>
            <p>
              We may process your information if you have given us express or
              implied consent. You can withdraw your consent at any time. In
              some exceptional cases, applicable law may permit processing
              without consent, including for investigations, fraud detection and
              prevention, business transactions, legal disclosures, emergencies,
              publicly available information, and approved research or
              statistics projects subject to confidentiality commitments.
            </p>
          </section>

          <section id="whoshare" className={styles.section}>
            <h2>4. When and With Whom Do We Share Your Personal Information?</h2>
            <p className={styles.short}>
              In Short: We may share information in specific situations
              described in this section and/or with specific third parties.
            </p>
            <ul>
              <li>
                <strong>Business Transfers.</strong> We may share or transfer
                your information in connection with, or during negotiations of,
                any merger, sale of company assets, financing, or acquisition of
                all or a portion of our business to another company.
              </li>
            </ul>
          </section>

          <section id="cookies" className={styles.section}>
            <h2>5. Do We Use Cookies and Other Tracking Technologies?</h2>
            <p className={styles.short}>
              In Short: We may use cookies and other tracking technologies to
              collect and store your information.
            </p>
            <p>
              We may use cookies and similar tracking technologies, like web
              beacons and pixels, when you interact with our Services. Some
              technologies help us maintain security, prevent crashes, fix bugs,
              save preferences, and assist with basic site functions.
            </p>
            <p>
              We may permit third parties and service providers to use online
              tracking technologies on our Services for analytics and
              advertising. To the extent these technologies are deemed a
              &quot;sale&quot; or &quot;sharing&quot; under applicable US state laws, you can
              opt out by submitting a request as described in the section about
              United States resident privacy rights.
            </p>
            <h3>Google Analytics</h3>
            <p>
              We may share your information with Google Analytics to track and
              analyze use of the Services. To opt out of being tracked by Google
              Analytics across the Services, visit{" "}
              <a href="https://tools.google.com/dlpage/gaoptout">
                https://tools.google.com/dlpage/gaoptout
              </a>
              . You can also adjust{" "}
              <a href="https://adssettings.google.com/">Ads Settings</a> or
              visit{" "}
              <a href="http://optout.networkadvertising.org/">
                http://optout.networkadvertising.org/
              </a>
              .
            </p>
          </section>

          <section id="ai" className={styles.section}>
            <h2>6. Do We Offer Artificial Intelligence-Based Products?</h2>
            <p className={styles.short}>
              In Short: We offer products, features, or tools powered by
              artificial intelligence, machine learning, or similar technologies.
            </p>
            <p>
              As part of our Services, we offer products, features, or tools
              powered by artificial intelligence, machine learning, or similar
              technologies. These tools are designed to enhance your experience
              and provide innovative solutions.
            </p>
            <p>
              We provide AI Products through third-party service providers,
              including Amazon Web Services (AWS) AI, Google Cloud AI, OpenAI,
              and Anthropic. Your input, output, and personal information may be
              shared with and processed by these AI Service Providers to enable
              your use of our AI Products.
            </p>
            <p>Our AI Products are designed for image analysis, AI automation, and natural language processing.</p>
          </section>

          <section id="inforetain" className={styles.section}>
            <h2>7. How Long Do We Keep Your Information?</h2>
            <p className={styles.short}>
              In Short: We keep your information for as long as necessary to
              fulfill the purposes outlined in this Privacy Notice unless
              otherwise required by law.
            </p>
            <p>
              We will only keep your personal information for as long as it is
              necessary for the purposes set out in this Privacy Notice, unless a
              longer retention period is required or permitted by law. No purpose
              in this notice will require us keeping your personal information
              for longer than the period of time in which users have an account
              with us.
            </p>
            <p>
              When we have no ongoing legitimate business need to process your
              personal information, we will either delete or anonymize it, or, if
              this is not possible, securely store it and isolate it from further
              processing until deletion is possible.
            </p>
          </section>

          <section id="infosafe" className={styles.section}>
            <h2>8. How Do We Keep Your Information Safe?</h2>
            <p className={styles.short}>
              In Short: We aim to protect your personal information through
              organizational and technical security measures.
            </p>
            <p>
              We have implemented appropriate and reasonable technical and
              organizational security measures designed to protect the security
              of any personal information we process. However, no electronic
              transmission over the Internet or information storage technology
              can be guaranteed to be 100% secure.
            </p>
          </section>

          <section id="infominors" className={styles.section}>
            <h2>9. Do We Collect Information From Minors?</h2>
            <p className={styles.short}>
              In Short: We do not knowingly collect data from or market to
              children under 18 years of age or the equivalent age specified by
              law in your jurisdiction.
            </p>
            <p>
              If we learn that personal information from users less than 18
              years of age has been collected, we will deactivate the account and
              take reasonable measures to promptly delete such data from our
              records. If you become aware of any data we may have collected
              from children, please contact us at{" "}
              <a href="mailto:privacy@nyabag.com">privacy@nyabag.com</a>.
            </p>
          </section>

          <section id="privacyrights" className={styles.section}>
            <h2>10. What Are Your Privacy Rights?</h2>
            <p className={styles.short}>
              In Short: Depending on where you live, you may have rights that
              allow you greater access to and control over your personal
              information.
            </p>
            <p>
              In some regions, including the EEA, UK, Switzerland, and Canada,
              these may include the right to request access and obtain a copy of
              your personal information, request rectification or erasure,
              restrict processing, request data portability, and not be subject
              to automated decision-making in certain circumstances.
            </p>
            <p>
              If you are located in the EEA or UK and believe we are unlawfully
              processing your personal information, you have the right to
              complain to your{" "}
              <a href="https://ec.europa.eu/justice/data-protection/bodies/authorities/index_en.htm">
                Member State data protection authority
              </a>{" "}
              or{" "}
              <a href="https://ico.org.uk/make-a-complaint/data-protection-complaints/data-protection-complaints/">
                UK data protection authority
              </a>
              . If you are located in Switzerland, you may contact the{" "}
              <a href="https://www.edoeb.admin.ch/edoeb/en/home.html">
                Federal Data Protection and Information Commissioner
              </a>
              .
            </p>
            <p>
              You can withdraw consent at any time by contacting us at{" "}
              <a href="mailto:privacy@nyabag.com">privacy@nyabag.com</a>. You
              can unsubscribe from marketing communications by clicking the
              unsubscribe link in our emails or contacting us.
            </p>
            <h3>Account Information</h3>
            <ul>
              <li>Log in to your account settings and update your user account.</li>
              <li>Contact us using the contact information provided.</li>
            </ul>
            <p>
              Upon your request to terminate your account, we will deactivate or
              delete your account and information from our active databases,
              subject to retention needed for fraud prevention, troubleshooting,
              investigations, legal terms, or legal requirements.
            </p>
          </section>

          <section id="DNT" className={styles.section}>
            <h2>11. Controls for Do-Not-Track Features</h2>
            <p>
              Most web browsers and some mobile operating systems and mobile
              applications include a Do-Not-Track (&quot;DNT&quot;) feature or setting.
              At this stage, no uniform technology standard for recognizing and
              implementing DNT signals has been finalized. As such, we do not
              currently respond to DNT browser signals or any other mechanism
              that automatically communicates your choice not to be tracked
              online.
            </p>
          </section>

          <section id="uslaws" className={styles.section}>
            <h2>12. Do United States Residents Have Specific Privacy Rights?</h2>
            <p className={styles.short}>
              In Short: If you are a resident of certain US states, you may have
              rights to request access to, correction of, a copy of, or deletion
              of your personal information, and to withdraw consent in certain
              circumstances.
            </p>
            <h3>Categories of Personal Information We Collect</h3>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Category</th>
                    <th>Examples</th>
                    <th>Collected</th>
                  </tr>
                </thead>
                <tbody>
                  {personalInfoRows.map(([category, examples, collected]) => (
                    <tr key={category}>
                      <td>{category}</td>
                      <td>{examples || " "}</td>
                      <td>{collected}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p>
              We have not disclosed, sold, or shared any personal information to
              third parties for a business or commercial purpose in the preceding
              twelve (12) months. We will not sell or share personal information
              in the future belonging to website visitors, users, and other
              consumers.
            </p>
            <h3>Your Rights</h3>
            <ul>
              <li>Right to know whether or not we are processing your personal data</li>
              <li>Right to access your personal data</li>
              <li>Right to correct inaccuracies in your personal data</li>
              <li>Right to request deletion of your personal data</li>
              <li>Right to obtain a copy of personal data you previously shared with us</li>
              <li>Right to non-discrimination for exercising your rights</li>
              <li>Right to opt out of targeted advertising, sale, or certain profiling</li>
            </ul>
            <h3>How to Exercise Your Rights</h3>
            <p>
              To exercise these rights, submit a{" "}
              <a href="https://app.termly.io/dsar/08c1d124-bf58-48a8-80eb-3e9cd5be759c">
                data subject access request
              </a>
              , email us at{" "}
              <a href="mailto:privacy@nyabag.com">privacy@nyabag.com</a>, or use
              the contact details in this policy.
            </p>
            <p>
              Upon receiving your request, we will need to verify your identity.
              If we decline to take action regarding your request, you may appeal
              our decision by emailing{" "}
              <a href="mailto:privacy@nyabag.com">privacy@nyabag.com</a>.
            </p>
            <h3>California &quot;Shine The Light&quot; Law</h3>
            <p>
              California residents may request information about categories of
              personal information, if any, disclosed to third parties for direct
              marketing purposes and the names of those third parties in the
              immediately preceding calendar year.
            </p>
          </section>

          <section id="policyupdates" className={styles.section}>
            <h2>13. Do We Make Updates to This Notice?</h2>
            <p className={styles.short}>
              In Short: Yes, we will update this notice as necessary to stay
              compliant with relevant laws.
            </p>
            <p>
              We may update this Privacy Notice from time to time. The updated
              version will be indicated by an updated &quot;Revised&quot; date at the top
              of this Privacy Notice. If we make material changes, we may notify
              you by prominently posting a notice or directly sending you a
              notification.
            </p>
          </section>

          <section id="contact" className={styles.section}>
            <h2>14. How Can You Contact Us About This Notice?</h2>
            <p>
              If you have questions or comments about this notice, you may email
              us at <a href="mailto:privacy@nyabag.com">privacy@nyabag.com</a>.
            </p>
          </section>

          <section id="request" className={styles.section}>
            <h2>15. How Can You Review, Update, or Delete the Data We Collect From You?</h2>
            <p>
              Based on the applicable laws of your country or state of residence,
              you may have the right to request access to the personal
              information we collect from you, details about how we have
              processed it, correction of inaccuracies, or deletion of your
              personal information. You may also have the right to withdraw your
              consent to our processing of your personal information.
            </p>
            <p>
              To request to review, update, or delete your personal information,
              please fill out and submit a{" "}
              <a href="https://app.termly.io/dsar/08c1d124-bf58-48a8-80eb-3e9cd5be759c">
                data subject access request
              </a>
              .
            </p>
            <p className={styles.credit}>
              This Privacy Policy was created using Termly&apos;s{" "}
              <a href="https://termly.io/products/privacy-policy-generator/">
                Privacy Policy Generator
              </a>
              .
            </p>
          </section>
        </main>
      </div>
    </div>
  );
}
