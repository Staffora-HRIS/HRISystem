import { Link } from "react-router";

export default function TermsOfService() {
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-b from-brand-50/60 to-white py-20 sm:py-28">
        <div className="bg-grid absolute inset-0" />
        <div className="relative mx-auto max-w-7xl px-6 lg:px-8 text-center">
          <h1 className="text-4xl font-extrabold tracking-tight text-gray-900 sm:text-5xl">
            Terms of Service
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
            <p>
              Welcome to Staffora. These Terms of Service ("Terms") govern
              your access to and use of the Staffora website, applications,
              and services (collectively, the "Service") provided by
              Staffora Ltd ("Staffora," "we," "us," or "our"). Please
              read these Terms carefully before using the Service.
            </p>

            <h2>1. Agreement to Terms</h2>
            <p>
              By accessing or using the Service, you agree to be bound by these
              Terms and our{" "}
              <Link to="/legal/privacy">Privacy Policy</Link>. If you are using
              the Service on behalf of an organization, you represent and warrant
              that you have the authority to bind that organization to these
              Terms, and "you" and "your" will refer to that organization. If you
              do not agree to these Terms, you may not access or use the Service.
            </p>

            <h2>2. Description of Service</h2>
            <p>
              Staffora is a cloud-based human resource information system
              designed to help organizations manage their workforce more
              effectively. The Service includes, but is not limited to, the
              following modules:
            </p>
            <ul>
              <li>
                <strong>Core HR</strong> — Employee records management,
                organizational structure, and reporting
              </li>
              <li>
                <strong>Time & Attendance</strong> — Clock-in/clock-out
                tracking, timesheets, and scheduling
              </li>
              <li>
                <strong>Leave Management</strong> — Absence requests, accruals,
                balances, and approval workflows
              </li>
              <li>
                <strong>Performance Management</strong> — Goals, reviews,
                calibration, and competency frameworks
              </li>
              <li>
                <strong>Recruitment</strong> — Applicant tracking, job postings,
                candidate pipelines, and hiring workflows
              </li>
              <li>
                <strong>Learning Management (LMS)</strong> — Courses, learning
                paths, certifications, and compliance training
              </li>
              <li>
                <strong>Benefits Administration</strong> — Plan enrollment,
                eligibility management, and benefits reporting
              </li>
              <li>
                <strong>Onboarding</strong> — Task checklists, document
                collection, and new hire workflows
              </li>
              <li>
                <strong>Succession Planning</strong> — Talent pools, readiness
                assessments, and development plans
              </li>
              <li>
                <strong>Analytics & Reporting</strong> — Dashboards, custom
                reports, and workforce insights
              </li>
            </ul>
            <p>
              We may add, modify, or discontinue features of the Service at any
              time. We will provide reasonable notice before discontinuing any
              material functionality.
            </p>

            <h2>3. Account Registration</h2>
            <p>
              To use the Service, you must create an account and provide
              accurate, complete, and current information. You agree to the
              following:
            </p>
            <ul>
              <li>
                You must provide truthful and accurate registration information,
                including your legal name, business email address, and company
                details.
              </li>
              <li>
                You are solely responsible for maintaining the confidentiality
                and security of your account credentials. You must not share your
                login credentials with any other person.
              </li>
              <li>
                You must be at least 18 years of age to create an account and
                use the Service.
              </li>
              <li>
                Each individual may only maintain one account. Duplicate accounts
                may be terminated without notice.
              </li>
              <li>
                You must promptly notify us at{" "}
                <a href="mailto:security@staffora.co.uk">
                  security@staffora.co.uk
                </a>{" "}
                if you become aware of any unauthorized access to or use of your
                account.
              </li>
            </ul>
            <p>
              We reserve the right to suspend or terminate accounts that violate
              these Terms or that contain inaccurate registration information.
            </p>

            <h2>4. Subscription & Billing</h2>
            <p>
              Access to the Service requires a paid subscription. The following
              terms apply to all subscriptions:
            </p>

            <h3>4.1 Pricing</h3>
            <p>
              Subscription plans are priced based on the number of active
              employees managed within the platform. Current pricing is
              available on our{" "}
              <Link to="/pricing">Pricing page</Link>. All fees are quoted in US
              dollars unless otherwise specified.
            </p>

            <h3>4.2 Billing Cycle</h3>
            <p>
              You may choose to be billed on a monthly or annual basis. Annual
              subscriptions are billed in advance for the full year. Monthly
              subscriptions are billed at the beginning of each monthly period.
            </p>

            <h3>4.3 Auto-Renewal</h3>
            <p>
              All subscriptions automatically renew at the end of each billing
              period unless you cancel your subscription before the renewal
              date. You may cancel auto-renewal at any time through your account
              settings or by contacting our support team.
            </p>

            <h3>4.4 Price Changes</h3>
            <p>
              We may adjust our pricing from time to time. We will provide at
              least 30 days' prior written notice of any price increase. Price
              changes will take effect at the beginning of your next billing
              period following the notice period. Your continued use of the
              Service after a price change constitutes acceptance of the new
              pricing.
            </p>

            <h3>4.5 Refunds</h3>
            <p>
              Annual subscriptions are eligible for a pro-rated refund within
              the first 30 days of the subscription term. Monthly subscriptions
              are non-refundable. Refund requests should be directed to{" "}
              <a href="mailto:billing@staffora.co.uk">
                billing@staffora.co.uk
              </a>
              .
            </p>

            <h2>5. Data Ownership</h2>
            <p>
              We believe your data belongs to you. The following principles
              govern data ownership:
            </p>
            <ul>
              <li>
                <strong>Your Data.</strong> All data that you or your authorized
                users upload, enter, or otherwise transmit to the Service
                ("Customer Data") remains your sole property. We do not claim any
                ownership rights over Customer Data.
              </li>
              <li>
                <strong>Limited License.</strong> You grant us a limited,
                non-exclusive license to process, store, and transmit Customer
                Data solely for the purpose of providing and improving the
                Service.
              </li>
              <li>
                <strong>Data Export.</strong> You may export your Customer Data at
                any time in standard formats (CSV, Excel, JSON) through the
                platform's built-in export functionality or via our API.
              </li>
              <li>
                <strong>Data Deletion.</strong> Upon termination of your account,
                we will retain your Customer Data for a period of 30 days to
                allow you to export your data. After this 30-day window, all
                Customer Data will be permanently and irreversibly deleted from
                our systems, including backups, within 90 days.
              </li>
            </ul>

            <h2>6. Acceptable Use</h2>
            <p>
              You agree to use the Service only for lawful purposes and in
              accordance with these Terms. You may not:
            </p>
            <ul>
              <li>
                Use the Service to engage in any activity that is illegal,
                fraudulent, harmful, or in violation of any applicable local,
                state, national, or international law or regulation.
              </li>
              <li>
                Reverse engineer, decompile, disassemble, or otherwise attempt
                to derive the source code, algorithms, or underlying structure of
                the Service or any part thereof.
              </li>
              <li>
                Share, transfer, or disclose your account credentials to any
                third party, or allow any unauthorized person to access the
                Service using your account.
              </li>
              <li>
                Use any automated means, including bots, scrapers, crawlers, or
                other automated tools, to access, collect data from, or interact
                with the Service without our prior written consent.
              </li>
              <li>
                Interfere with, disrupt, or attempt to gain unauthorized access
                to the Service, its servers, or any networks connected to the
                Service.
              </li>
              <li>
                Upload or transmit any malicious code, viruses, or other
                harmful material through the Service.
              </li>
              <li>
                Sublicense, resell, or redistribute the Service or any part
                thereof without our prior written consent.
              </li>
            </ul>
            <p>
              Violation of these acceptable use policies may result in immediate
              suspension or termination of your account.
            </p>

            <h2>7. Privacy</h2>
            <p>
              Your privacy is important to us. Our collection, use, and
              protection of personal information is governed by our{" "}
              <Link to="/legal/privacy">Privacy Policy</Link>, which is
              incorporated into these Terms by reference. By using the Service,
              you acknowledge that you have read and understood our Privacy
              Policy and consent to the practices described therein.
            </p>
            <p>
              As a data processor on your behalf, we are committed to complying
              with applicable data protection laws, including the General Data
              Protection Regulation (GDPR) and the California Consumer Privacy
              Act (CCPA). Additional information about our data processing
              practices is available upon request.
            </p>

            <h2>8. Intellectual Property</h2>
            <p>
              The Service, including all software, source code, documentation,
              designs, user interfaces, trademarks, logos, and all other
              intellectual property embodied in or associated with the Service
              (collectively, "Platform IP"), is and shall remain the exclusive
              property of Staffora and its licensors. These Terms do not
              grant you any rights to the Platform IP except for the limited
              right to use the Service in accordance with these Terms.
            </p>
            <p>
              As stated in Section 5, all Customer Data remains your property.
              Nothing in these Terms transfers ownership of Customer Data to
              Staffora.
            </p>
            <p>
              If you provide any feedback, suggestions, or ideas regarding the
              Service ("Feedback"), you grant us a non-exclusive, royalty-free,
              perpetual, and irrevocable license to use, modify, and incorporate
              such Feedback into the Service without any obligation to you.
            </p>

            <h2>9. Limitation of Liability</h2>
            <p>
              TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW:
            </p>
            <ul>
              <li>
                Staffora shall not be liable for any indirect, incidental,
                special, consequential, or punitive damages, including but not
                limited to loss of profits, data, business opportunities,
                goodwill, or other intangible losses, arising out of or related
                to your use of or inability to use the Service, regardless of
                the theory of liability (contract, tort, strict liability, or
                otherwise) and even if Staffora has been advised of the
                possibility of such damages.
              </li>
              <li>
                Staffora's total aggregate liability arising out of or
                related to these Terms or the Service shall not exceed the total
                amount of fees paid by you to Staffora during the twelve
                (12) month period immediately preceding the event giving rise to
                the claim.
              </li>
              <li>
                The Service is provided on an "as is" and "as available" basis.
                We make no warranties, express or implied, regarding the
                Service, including but not limited to warranties of
                merchantability, fitness for a particular purpose, and
                non-infringement.
              </li>
            </ul>
            <p>
              Some jurisdictions do not allow the exclusion or limitation of
              certain damages, so some of the above limitations may not apply
              to you. In such cases, our liability shall be limited to the
              fullest extent permitted by applicable law.
            </p>

            <h2>10. Termination</h2>
            <p>
              Either party may terminate these Terms and the associated
              subscription as follows:
            </p>
            <ul>
              <li>
                <strong>By You.</strong> You may terminate your subscription at
                any time by providing at least 30 days' written notice to us.
                Your access to the Service will continue until the end of your
                current billing period.
              </li>
              <li>
                <strong>By Us.</strong> We may terminate or suspend your access
                to the Service immediately if you breach these Terms, fail to
                pay applicable fees, or engage in conduct that we reasonably
                believe is harmful to us, our users, or third parties. We may
                also terminate your account with 30 days' notice for any reason.
              </li>
              <li>
                <strong>Effect of Termination.</strong> Upon termination, your
                right to use the Service will immediately cease. You will have
                30 days from the date of termination to export your Customer
                Data using the platform's export tools or API. After this 30-day
                period, your Customer Data will be permanently deleted.
              </li>
            </ul>
            <p>
              Sections 5, 8, 9, and 12 shall survive termination of these Terms.
            </p>

            <h2>11. Changes to Terms</h2>
            <p>
              We reserve the right to modify these Terms at any time. When we
              make changes, we will update the "Last updated" date at the top
              of this page. For material changes that affect your rights or
              obligations, we will provide at least 30 days' prior notice via
              email to the address associated with your account.
            </p>
            <p>
              Your continued use of the Service after any changes to these Terms
              constitutes your acceptance of the revised Terms. If you do not
              agree to the updated Terms, you must stop using the Service and
              may terminate your account in accordance with Section 10.
            </p>

            <h2>12. Governing Law</h2>
            <p>
              These Terms shall be governed by and construed in accordance with
              the laws of the State of Delaware, United States, without regard
              to its conflict of law principles. Any disputes arising out of or
              related to these Terms or the Service shall be resolved
              exclusively in the state or federal courts located in Wilmington,
              Delaware, and you consent to the personal jurisdiction and venue
              of such courts.
            </p>

            <h2>13. Contact</h2>
            <p>
              If you have any questions about these Terms of Service, please
              contact us at:
            </p>
            <p>
              <strong>Staffora Ltd</strong>
              <br />
              Email:{" "}
              <a href="mailto:legal@staffora.co.uk">legal@staffora.co.uk</a>
              <br />
              staffora.co.uk
            </p>
          </article>
        </div>
      </section>
    </>
  );
}
