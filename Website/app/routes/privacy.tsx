import { Link } from "react-router";

export default function PrivacyPolicy() {
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-b from-brand-50/60 to-white py-20 sm:py-28">
        <div className="bg-grid absolute inset-0" />
        <div className="relative mx-auto max-w-7xl px-6 lg:px-8 text-center">
          <h1 className="text-4xl font-extrabold tracking-tight text-gray-900 sm:text-5xl">
            Privacy Policy
          </h1>
          <p className="mt-4 text-lg text-gray-500">
            Last updated: March 2026
          </p>
        </div>
      </section>

      {/* Content */}
      <section className="py-16 sm:py-20">
        <div className="mx-auto max-w-3xl px-6 lg:px-8">
          <article className="prose prose-gray prose-lg max-w-none prose-headings:font-bold prose-headings:tracking-tight prose-a:text-brand-600 prose-a:no-underline hover:prose-a:underline prose-h2:text-2xl prose-h2:mt-12 prose-h2:mb-4 prose-h3:text-xl prose-h3:mt-8 prose-h3:mb-3 prose-p:leading-relaxed prose-li:leading-relaxed">
            <h2>1. Introduction</h2>
            <p>
              At Staffora Ltd ("Staffora," "we," "us," or "our"), we
              respect your privacy and are committed to protecting the personal
              information you share with us. This Privacy Policy explains what
              data we collect, how we use it, how we protect it, and what rights
              you have regarding your information.
            </p>
            <p>
              This policy applies to all users of the Staffora website,
              applications, and services (collectively, the "Service"), including
              account administrators, employees whose data is managed within
              the platform, and visitors to our website. By using the Service,
              you acknowledge that you have read and understood this Privacy
              Policy. For information about the terms governing your use of
              the Service, please see our{" "}
              <Link to="/legal/terms">Terms of Service</Link>.
            </p>

            <h2>2. Information We Collect</h2>
            <p>
              We collect different types of information depending on how you
              interact with the Service:
            </p>

            <h3>2.1 Account Information</h3>
            <p>
              When you register for an account, we collect identifying
              information necessary to provide the Service, including your full
              name, business email address, company name, job title, and phone
              number. If you are an administrator, we also collect billing
              information such as your billing address and payment method
              details (processed securely through our payment provider).
            </p>

            <h3>2.2 HR Data (Customer Data)</h3>
            <p>
              As an HR management platform, the Service stores employee records
              and related data uploaded and managed by our customers. This may
              include employee names, contact information, employment history,
              compensation details, benefits enrollments, performance reviews,
              training records, and other information relevant to the
              employer-employee relationship. This data is owned by the
              customer and processed by Staffora solely to provide the
              Service (see our{" "}
              <Link to="/legal/terms">Terms of Service</Link>, Section 5).
            </p>

            <h3>2.3 Usage Data</h3>
            <p>
              We automatically collect anonymized and aggregated usage data
              about how you interact with the Service. This includes pages
              viewed, features used, navigation patterns, time spent on
              specific areas of the platform, and general interaction metrics.
              This data is used exclusively to improve the Service and is never
              linked to identifiable individuals or shared with third parties.
            </p>

            <h3>2.4 Device & Technical Information</h3>
            <p>
              For security and troubleshooting purposes, we collect technical
              information about the devices used to access the Service. This
              includes your browser type and version, operating system, IP
              address, device identifiers, and general geographic location
              (derived from IP address). This information helps us detect
              unauthorized access, investigate security incidents, and ensure
              the Service functions correctly across different environments.
            </p>

            <h2>3. How We Use Your Information</h2>
            <p>
              We use the information we collect for the following purposes:
            </p>
            <ul>
              <li>
                <strong>Providing the Service.</strong> Processing and storing
                your data to deliver the core functionality of the platform,
                including employee management, reporting, and workflow
                automation.
              </li>
              <li>
                <strong>Improving the Platform.</strong> Analyzing anonymized
                usage patterns to identify areas for improvement, develop new
                features, and optimize the user experience.
              </li>
              <li>
                <strong>Transactional Communications.</strong> Sending
                essential emails related to your account, including
                registration confirmations, subscription invoices, password
                resets, security alerts, and system notifications.
              </li>
              <li>
                <strong>Security Monitoring.</strong> Monitoring for suspicious
                activity, unauthorized access attempts, and other security
                threats to protect your account and data.
              </li>
              <li>
                <strong>Customer Support.</strong> Using your information to
                respond to support requests, troubleshoot issues, and provide
                assistance in using the Service.
              </li>
              <li>
                <strong>Legal Compliance.</strong> Processing data as required
                by applicable laws, regulations, or valid legal processes.
              </li>
            </ul>
            <p>
              We do not use your personal information for advertising purposes.
              We do not build user profiles for targeted advertising, and we do
              not sell your data to advertisers or data brokers.
            </p>

            <h2>4. Data Storage & Security</h2>
            <p>
              We take the security of your data seriously and employ
              industry-standard measures to protect it:
            </p>
            <ul>
              <li>
                <strong>Encryption.</strong> All data is encrypted at rest using
                AES-256 encryption and in transit using TLS 1.3. Database
                backups are also encrypted.
              </li>
              <li>
                <strong>Multi-Tenant Isolation.</strong> Customer data is
                logically isolated using PostgreSQL Row-Level Security (RLS)
                policies. Each tenant's data is strictly separated at the
                database level, ensuring that no customer can access another
                customer's data.
              </li>
              <li>
                <strong>Security Audits.</strong> We conduct regular security
                audits, penetration testing, and vulnerability assessments.
                All findings are tracked and remediated promptly.
              </li>
              <li>
                <strong>Compliance.</strong> We are pursuing SOC 2 Type II
                certification and align our security practices with the SOC 2
                Trust Service Criteria. We maintain documented security
                policies, access controls, and incident response procedures.
              </li>
              <li>
                <strong>Data Residency.</strong> Customer data is stored in data
                centers located in the United States or the European Union,
                based on your preference selected during account setup. Data
                residency preferences can be reviewed in your account settings.
              </li>
            </ul>

            <h2>5. Data Sharing</h2>
            <p>
              <strong>We do not sell your personal information.</strong> We do
              not, and will not, sell, rent, or trade your data to any third
              party for commercial purposes.
            </p>
            <p>
              We may share limited information with the following categories of
              trusted third-party service providers, solely to operate and
              deliver the Service:
            </p>
            <ul>
              <li>
                <strong>Infrastructure Providers.</strong> Cloud hosting and
                infrastructure services used to run and maintain the platform.
                These providers are contractually bound to protect your data
                and process it only as directed by us.
              </li>
              <li>
                <strong>Payment Processor.</strong> We use Stripe to process
                subscription payments. Stripe receives only the billing
                information necessary to process transactions. We do not store
                credit card numbers on our servers. Stripe's privacy practices
                are governed by their own privacy policy.
              </li>
              <li>
                <strong>Email Service.</strong> Transactional email delivery
                services used to send account-related notifications. These
                services receive only the email addresses and message content
                necessary to deliver communications.
              </li>
              <li>
                <strong>Legal Requirements.</strong> We may disclose
                information if required to do so by law, regulation, legal
                process, or enforceable governmental request, or if we
                reasonably believe that disclosure is necessary to protect the
                rights, property, or safety of Staffora, our users, or the
                public.
              </li>
            </ul>
            <p>
              All third-party service providers are vetted for their security
              practices and are required to enter into data processing
              agreements that comply with applicable data protection laws.
            </p>

            <h2>6. Data Retention</h2>
            <p>
              Our data retention practices are designed to keep your information
              only as long as necessary:
            </p>
            <ul>
              <li>
                <strong>Active Accounts.</strong> While your account is active,
                we retain all Customer Data necessary to provide the Service.
                You can delete specific records within the platform at any time,
                subject to any applicable regulatory retention requirements.
              </li>
              <li>
                <strong>After Account Termination.</strong> Following
                termination of your account, we retain your Customer Data for a
                30-day export window during which you can download your data in
                standard formats. After this period, all Customer Data is
                permanently deleted from our production systems. Backup copies
                are purged within 90 days of termination.
              </li>
              <li>
                <strong>Audit Logs.</strong> System audit logs that record
                account activity (such as login events, data changes, and
                administrative actions) are retained for compliance and security
                purposes. The retention period for audit logs is configurable by
                the account administrator, with a default of 7 years for
                regulatory compliance.
              </li>
              <li>
                <strong>Anonymized Data.</strong> Aggregated, anonymized usage
                data that cannot be linked to any individual may be retained
                indefinitely for analytics and product improvement purposes.
              </li>
            </ul>

            <h2>7. Your Rights (GDPR / CCPA)</h2>
            <p>
              Depending on your jurisdiction, you may have the following rights
              regarding your personal information:
            </p>
            <ul>
              <li>
                <strong>Right to Access.</strong> You may request a copy of the
                personal information we hold about you.
              </li>
              <li>
                <strong>Right to Correction.</strong> You may request that we
                correct any inaccurate or incomplete personal information.
              </li>
              <li>
                <strong>Right to Deletion.</strong> You may request that we
                delete your personal information, subject to certain
                exceptions (e.g., legal retention requirements).
              </li>
              <li>
                <strong>Right to Data Portability.</strong> You may request a
                copy of your data in a structured, commonly used,
                machine-readable format.
              </li>
              <li>
                <strong>Right to Restrict Processing.</strong> You may request
                that we limit the processing of your personal information in
                certain circumstances.
              </li>
              <li>
                <strong>Right to Object.</strong> You may object to the
                processing of your personal information for certain purposes,
                including direct marketing.
              </li>
            </ul>
            <p>
              To exercise any of these rights, please contact us at{" "}
              <a href="mailto:privacy@staffora.co.uk">
                privacy@staffora.co.uk
              </a>
              . We will respond to your request within 30 days. If you are an
              employee whose data is managed by a customer of Staffora,
              please contact your employer directly, as they are the data
              controller for your information.
            </p>
            <p>
              California residents may also exercise their rights under the
              California Consumer Privacy Act (CCPA), including the right to
              know what personal information is collected and the right to opt
              out of the sale of personal information (note: we do not sell
              personal information).
            </p>

            <h2>8. Cookies</h2>
            <p>
              We use cookies and similar technologies to operate the Service.
              Our approach to cookies is minimal and privacy-focused:
            </p>
            <ul>
              <li>
                <strong>Essential Cookies.</strong> These cookies are required
                for the Service to function properly. They include session
                cookies for authentication, CSRF protection tokens, and
                preference cookies (e.g., language settings). Essential cookies
                are set by default and cannot be disabled without breaking core
                functionality.
              </li>
              <li>
                <strong>Analytics Cookies.</strong> We use privacy-focused
                analytics to understand how users interact with the Service.
                Analytics cookies are only set with your explicit consent. You
                can manage your consent preferences at any time through the
                cookie settings in your account.
              </li>
              <li>
                <strong>No Advertising Cookies.</strong> We do not use
                third-party advertising cookies, tracking pixels, or any other
                technology that enables third-party advertisers to track you
                across websites.
              </li>
            </ul>

            <h2>9. Children's Privacy</h2>
            <p>
              The Service is designed for use by businesses and their adult
              employees. It is not intended for individuals under the age of
              18. We do not knowingly collect personal information from anyone
              under 18 years of age. If we become aware that we have
              inadvertently collected information from a minor, we will take
              prompt steps to delete that information. If you believe that we
              may have collected information from a minor, please contact us
              at{" "}
              <a href="mailto:privacy@staffora.co.uk">
                privacy@staffora.co.uk
              </a>
              .
            </p>

            <h2>10. International Data Transfers</h2>
            <p>
              If you are located outside of the United States, your information
              may be transferred to and processed in the United States or other
              jurisdictions where our service providers operate. We ensure
              that all international data transfers comply with applicable data
              protection laws through the following mechanisms:
            </p>
            <ul>
              <li>
                <strong>Standard Contractual Clauses (SCCs).</strong> For
                transfers of personal data from the European Economic Area
                (EEA), United Kingdom, or Switzerland to the United States or
                other countries outside the EEA, we rely on the European
                Commission's Standard Contractual Clauses as a legal mechanism
                to safeguard your data.
              </li>
              <li>
                <strong>Data Processing Agreements.</strong> We enter into data
                processing agreements with all third-party service providers
                that process personal data on our behalf, ensuring they maintain
                adequate data protection standards.
              </li>
              <li>
                <strong>Data Residency Options.</strong> Customers can choose
                their preferred data storage region (US or EU) during account
                setup, and we ensure that primary data storage occurs within
                the selected region.
              </li>
            </ul>

            <h2>11. Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time to reflect
              changes in our practices, technologies, legal requirements, or
              other factors. When we make changes, we will update the "Last
              updated" date at the top of this page.
            </p>
            <p>
              For material changes that significantly affect how we collect,
              use, or share your personal information, we will provide at least
              30 days' prior notice via email to the address associated with
              your account. We encourage you to review this Privacy Policy
              periodically to stay informed about our data practices.
            </p>

            <h2>12. Contact</h2>
            <p>
              If you have any questions, concerns, or requests related to this
              Privacy Policy or our data practices, please contact us at:
            </p>
            <p>
              <strong>Staffora Ltd</strong>
              <br />
              Attn: Privacy Team
              <br />
              Email:{" "}
              <a href="mailto:privacy@staffora.co.uk">
                privacy@staffora.co.uk
              </a>
              <br />
              staffora.co.uk
            </p>
            <p>
              For data protection inquiries related to the GDPR, you may also
              contact our Data Protection Officer at{" "}
              <a href="mailto:dpo@staffora.co.uk">dpo@staffora.co.uk</a>.
            </p>
            <p>
              If you are not satisfied with our response to your inquiry, you
              have the right to lodge a complaint with your local data
              protection authority.
            </p>
          </article>
        </div>
      </section>
    </>
  );
}
