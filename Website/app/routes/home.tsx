import { Link } from "react-router";
import {
  Users,
  Clock,
  CalendarDays,
  Target,
  Briefcase,
  GraduationCap,
  Heart,
  ClipboardCheck,
  BarChart3,
  Shield,
  Building2,
  Zap,
  ArrowRight,
  Check,
  MessageSquare,
  FileText,
  GitBranch,
  Workflow,
} from "lucide-react";
import { cn } from "~/lib/utils";

/* -------------------------------------------------------------------------- */
/*  Data                                                                       */
/* -------------------------------------------------------------------------- */

const platformHighlights = [
  { label: "HR Modules", value: "13+", description: "End-to-end coverage" },
  { label: "API Endpoints", value: "200+", description: "RESTful & documented" },
  { label: "State Machines", value: "5", description: "Workflow enforcement" },
  { label: "Data Isolation", value: "100%", description: "Row-Level Security" },
];

const features = [
  {
    icon: Users,
    title: "Core HR",
    description:
      "Centralized employee records with effective-dated history, org chart visualization, and contract lifecycle management.",
  },
  {
    icon: Clock,
    title: "Time & Attendance",
    description:
      "Flexible clock-in/out with geo-fencing, configurable schedules, and automated timesheet generation.",
  },
  {
    icon: CalendarDays,
    title: "Leave Management",
    description:
      "PTO balances with accrual rules, absence policies, holiday calendars, and multi-level approval workflows.",
  },
  {
    icon: Target,
    title: "Talent & Performance",
    description:
      "Structured review cycles, goal tracking, 360-degree feedback, competency frameworks, and calibration sessions.",
  },
  {
    icon: Briefcase,
    title: "Recruitment",
    description:
      "Job postings, applicant tracking, pipeline stages, and collaborative hiring with structured evaluations.",
  },
  {
    icon: GraduationCap,
    title: "Learning (LMS)",
    description:
      "Course authoring, certifications, learning paths, completion tracking, and automated certificate generation.",
  },
  {
    icon: Heart,
    title: "Benefits",
    description:
      "Plan enrollment, qualifying life events, contribution tracking, and benefits cost analysis.",
  },
  {
    icon: ClipboardCheck,
    title: "Onboarding",
    description:
      "Task checklists, document collection, welcome flows, and self-service new-hire portals.",
  },
  {
    icon: MessageSquare,
    title: "Cases",
    description:
      "Employee case management with SLA tracking, escalation workflows, and resolution audit trails.",
  },
  {
    icon: FileText,
    title: "Documents",
    description:
      "Secure document storage, version control, access permissions, and template-based generation.",
  },
  {
    icon: GitBranch,
    title: "Succession",
    description:
      "Succession planning, talent pools, readiness assessments, and leadership pipeline visibility.",
  },
  {
    icon: Workflow,
    title: "Workflows",
    description:
      "Configurable approval chains, automated routing, conditional logic, and status tracking.",
  },
  {
    icon: BarChart3,
    title: "Analytics",
    description:
      "Real-time dashboards, custom reports, headcount trends, and workforce insights.",
  },
] as const;

const differentiators = [
  {
    icon: Shield,
    title: "Enterprise security, startup simplicity",
    description:
      "Row-level security isolates every query. Multi-factor authentication, role-based access control, and immutable audit logs come standard — with zero configuration required from your team.",
    bullets: [
      "Row-Level Security on every table",
      "MFA & session management built in",
      "Immutable, tamper-proof audit logs",
      "Fine-grained RBAC with custom roles",
    ],
  },
  {
    icon: Building2,
    title: "Built for multi-tenant from day one",
    description:
      "Each company operates in a fully isolated environment. Custom roles, branding, and workflows — without the overhead of separate infrastructure.",
    bullets: [
      "Complete data isolation per tenant",
      "Tenant-scoped roles & permissions",
      "Custom workflows per organization",
      "Single codebase, infinite scale",
    ],
  },
  {
    icon: Zap,
    title: "Automate the busywork",
    description:
      "From onboarding checklists to leave approvals, automate the repetitive tasks that slow your HR team down. Spend time on people, not paperwork.",
    bullets: [
      "Configurable approval workflows",
      "Automated notifications & reminders",
      "Event-driven domain architecture",
      "200+ RESTful API endpoints",
    ],
  },
];

const stats = [
  { value: "13+", label: "HR Modules" },
  { value: "200+", label: "API Endpoints" },
  { value: "5", label: "State Machines" },
  { value: "100%", label: "Data Isolation" },
];

/* -------------------------------------------------------------------------- */
/*  Sub-components                                                             */
/* -------------------------------------------------------------------------- */

const moduleCategories = [
  {
    label: "HR Management",
    modules: ["Core HR", "Documents", "Analytics"],
    color: "bg-brand-50 text-brand-700",
    barColor: "bg-brand-400",
    barWidth: "75%",
  },
  {
    label: "Time & Leave",
    modules: ["Time Tracking", "Leave", "Workflows"],
    color: "bg-amber-50 text-amber-700",
    barColor: "bg-amber-400",
    barWidth: "60%",
  },
  {
    label: "Talent & Learning",
    modules: ["Performance", "LMS", "Succession"],
    color: "bg-emerald-50 text-emerald-700",
    barColor: "bg-emerald-400",
    barWidth: "85%",
  },
];

function HeroDashboardMockup() {
  return (
    <div
      className="relative mx-auto mt-16 w-full max-w-4xl lg:mt-20"
      aria-hidden="true"
    >
      {/* Glow behind the mockup */}
      <div className="absolute -inset-4 rounded-3xl bg-brand-500/10 blur-3xl" />

      {/* Main card */}
      <div className="glass-card relative rounded-2xl border border-gray-200/60 p-6 shadow-2xl shadow-brand-500/10">
        {/* Top bar */}
        <div className="flex items-center gap-2 pb-4 border-b border-gray-100">
          <span className="h-3 w-3 rounded-full bg-red-400" />
          <span className="h-3 w-3 rounded-full bg-amber-400" />
          <span className="h-3 w-3 rounded-full bg-green-400" />
          <span className="ml-4 h-4 w-48 rounded bg-gray-100" />
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          {/* Module category cards */}
          {moduleCategories.map((category) => (
            <div
              key={category.label}
              className="rounded-xl border border-gray-100 bg-white p-4"
            >
              <p className="text-xs font-medium text-gray-500">
                {category.label}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {category.modules.map((mod) => (
                  <span
                    key={mod}
                    className={cn(
                      "rounded-md px-2 py-0.5 text-[10px] font-medium",
                      category.color
                    )}
                  >
                    {mod}
                  </span>
                ))}
              </div>
              <div className="mt-3 h-2 rounded-full bg-gray-100">
                <div
                  className={cn("h-full rounded-full", category.barColor)}
                  style={{ width: category.barWidth }}
                />
              </div>
            </div>
          ))}
        </div>

        {/* Module list preview */}
        <div className="mt-6 space-y-2">
          {[
            { name: "Recruitment", status: "Active" },
            { name: "Benefits", status: "Active" },
            { name: "Cases", status: "Active" },
          ].map((row) => (
            <div
              key={row.name}
              className="flex items-center gap-4 rounded-lg border border-gray-50 bg-gray-50/50 px-4 py-3"
            >
              <div className="h-8 w-8 rounded-full bg-brand-100" />
              <span className="text-xs font-medium text-gray-700">
                {row.name}
              </span>
              <div className="hidden h-3 w-20 rounded bg-gray-100 sm:block" />
              <span className="ml-auto rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-medium text-emerald-700">
                {row.status}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Floating side cards */}
      <div className="absolute -left-8 top-1/3 hidden animate-float rounded-xl glass-card p-4 lg:block">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent-100">
            <Check className="h-5 w-5 text-accent-600" />
          </div>
          <div>
            <p className="text-xs font-medium text-gray-900">Leave Approved</p>
            <p className="text-xs text-gray-500">Just now</p>
          </div>
        </div>
      </div>

      <div
        className="absolute -right-6 top-1/2 hidden rounded-xl glass-card p-4 lg:block"
        style={{ animation: "float 6s ease-in-out 1.5s infinite" }}
      >
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-100">
            <Users className="h-5 w-5 text-brand-600" />
          </div>
          <div>
            <p className="text-xs font-medium text-gray-900">New Hire Added</p>
            <p className="text-xs text-gray-500">2 min ago</p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Page                                                                       */
/* -------------------------------------------------------------------------- */

export default function HomePage() {
  return (
    <>
      {/* ------------------------------------------------------------------ */}
      {/*  Hero                                                               */}
      {/* ------------------------------------------------------------------ */}
      <section className="relative overflow-hidden">
        {/* Background layers */}
        <div className="absolute inset-0 bg-gradient-to-b from-brand-50/80 via-white to-white" />
        <div className="absolute inset-0 bg-grid" />
        {/* Radial glow */}
        <div className="absolute left-1/2 top-0 -translate-x-1/2 h-[600px] w-[900px] rounded-full bg-brand-400/10 blur-3xl" />

        <div className="relative mx-auto max-w-7xl px-6 pb-24 pt-20 sm:pt-28 lg:px-8 lg:pt-36">
          <div className="mx-auto max-w-3xl text-center animate-fade-in-up">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-brand-200 bg-brand-50/80 backdrop-blur-sm px-4 py-1.5 text-sm font-medium text-brand-700">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-accent-500" />
              </span>
              Now available for growing teams
            </div>

            <h1 className="text-4xl font-extrabold tracking-tight text-gray-900 sm:text-5xl lg:text-6xl">
              The HR platform that{" "}
              <span className="text-gradient">grows with your team</span>
            </h1>

            <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-gray-600 sm:text-xl">
              From 5 employees to 5,000 and beyond. One platform to manage
              hiring, onboarding, time tracking, performance, and everything in
              between.
            </p>

            <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Link
                to="/pricing"
                className="cursor-pointer inline-flex items-center gap-2 rounded-full bg-gradient-cta px-8 py-3.5 text-base font-semibold text-white shadow-lg shadow-accent-500/25 transition-all hover:shadow-accent-500/40 hover:-translate-y-0.5"
              >
                Get Started Free
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                to="/contact"
                className="cursor-pointer inline-flex items-center gap-2 rounded-full border-2 border-gray-300 bg-white px-8 py-3.5 text-base font-semibold text-gray-700 transition-all hover:border-brand-300 hover:text-brand-700"
              >
                Book a Demo
              </Link>
            </div>
          </div>

          {/* Dashboard mockup */}
          <HeroDashboardMockup />
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/*  Platform at a Glance                                               */}
      {/* ------------------------------------------------------------------ */}
      <section className="border-y border-gray-100 bg-gray-50/50 py-14">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <p className="text-center text-sm font-semibold uppercase tracking-widest text-gray-400">
            Platform at a Glance
          </p>
          <div className="mt-8 grid grid-cols-2 gap-6 sm:grid-cols-4 max-w-3xl mx-auto">
            {platformHighlights.map((item) => (
              <div
                key={item.label}
                className="flex flex-col items-center rounded-xl border border-gray-200/80 bg-white px-6 py-5 shadow-sm text-center"
              >
                <span className="text-3xl font-extrabold text-gradient">
                  {item.value}
                </span>
                <span className="mt-1 text-sm font-semibold text-gray-700">
                  {item.label}
                </span>
                <span className="mt-0.5 text-xs text-gray-400">
                  {item.description}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/*  Features Grid                                                      */}
      {/* ------------------------------------------------------------------ */}
      <section className="py-24 sm:py-32">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-semibold uppercase tracking-widest text-brand-600">
              All-in-one platform
            </p>
            <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-gray-900 sm:text-4xl">
              Everything you need to manage your people
            </h2>
            <p className="mt-4 text-lg text-gray-600">
              Thirteen powerful modules, one seamless experience. Every tool your
              HR team needs, with none of the complexity.
            </p>
          </div>

          <div className="mx-auto mt-16 grid max-w-6xl gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feature) => {
              const Icon = feature.icon;
              return (
                <article
                  key={feature.title}
                  className="group relative cursor-pointer rounded-2xl border border-gray-200/80 bg-white/80 backdrop-blur-sm p-6 transition-all duration-300 hover:shadow-xl hover:shadow-brand-500/5 hover:border-brand-200 hover:-translate-y-1"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50 text-brand-600 transition-colors group-hover:bg-brand-100">
                    <Icon className="h-6 w-6" />
                  </div>
                  <h3 className="mt-4 text-lg font-semibold text-gray-900">
                    {feature.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-gray-600">
                    {feature.description}
                  </p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/*  Differentiators                                                     */}
      {/* ------------------------------------------------------------------ */}
      <section className="border-t border-gray-100 bg-gray-50/50 py-24 sm:py-32">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-semibold uppercase tracking-widest text-brand-600">
              Why choose us
            </p>
            <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-gray-900 sm:text-4xl">
              Built different, on purpose
            </h2>
          </div>

          <div className="mt-20 space-y-28">
            {differentiators.map((item, index) => {
              const Icon = item.icon;
              const isReversed = index % 2 === 1;

              return (
                <div
                  key={item.title}
                  className={cn(
                    "flex flex-col items-center gap-12 lg:flex-row lg:gap-20",
                    isReversed && "lg:flex-row-reverse"
                  )}
                >
                  {/* Text */}
                  <div className="flex-1">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
                      <Icon className="h-7 w-7" />
                    </div>
                    <h3 className="mt-6 text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
                      {item.title}
                    </h3>
                    <p className="mt-4 text-base leading-relaxed text-gray-600">
                      {item.description}
                    </p>
                    <ul className="mt-6 space-y-3">
                      {item.bullets.map((bullet) => (
                        <li
                          key={bullet}
                          className="flex items-center gap-3 text-sm text-gray-700"
                        >
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-100 text-accent-600">
                            <Check className="h-3 w-3" />
                          </span>
                          {bullet}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Visual */}
                  <div className="flex-1" aria-hidden="true">
                    <div className="relative">
                      <div className="absolute -inset-4 rounded-3xl bg-brand-100/40 blur-2xl" />
                      <div className="glass-card relative rounded-2xl border border-gray-200/60 p-8">
                        {/* Abstract illustration per differentiator */}
                        {index === 0 && (
                          <div className="space-y-4">
                            <div className="flex items-center gap-3">
                              <Shield className="h-6 w-6 text-brand-600" />
                              <span className="text-sm font-semibold text-gray-900">
                                Security Dashboard
                              </span>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              {["RLS Active", "MFA Enabled", "RBAC Enforced", "Audit Logged"].map(
                                (label) => (
                                  <div
                                    key={label}
                                    className="flex items-center gap-2 rounded-lg bg-accent-50 px-3 py-2"
                                  >
                                    <span className="h-2 w-2 rounded-full bg-accent-500" />
                                    <span className="text-xs font-medium text-accent-700">
                                      {label}
                                    </span>
                                  </div>
                                )
                              )}
                            </div>
                            <div className="h-24 rounded-lg bg-gradient-to-r from-brand-50 to-accent-50 flex items-center justify-center">
                              <div className="flex items-center gap-2 text-sm font-medium text-brand-700">
                                <Check className="h-4 w-4" />
                                All security checks passing
                              </div>
                            </div>
                          </div>
                        )}
                        {index === 1 && (
                          <div className="space-y-4">
                            <div className="flex items-center gap-3">
                              <Building2 className="h-6 w-6 text-brand-600" />
                              <span className="text-sm font-semibold text-gray-900">
                                Tenant Overview
                              </span>
                            </div>
                            {[
                              { name: "Company A", initial: "A" },
                              { name: "Company B", initial: "B" },
                              { name: "Company C", initial: "C" },
                            ].map(({ name, initial }, i) => (
                                <div
                                  key={name}
                                  className="flex items-center justify-between rounded-lg border border-gray-100 px-4 py-3"
                                >
                                  <div className="flex items-center gap-3">
                                    <div
                                      className={cn(
                                        "flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold text-white",
                                        i === 0
                                          ? "bg-brand-500"
                                          : i === 1
                                            ? "bg-violet-500"
                                            : "bg-cyan-500"
                                      )}
                                    >
                                      {initial}
                                    </div>
                                    <span className="text-sm font-medium text-gray-900">
                                      {name}
                                    </span>
                                  </div>
                                  <span className="rounded-full bg-accent-50 px-2.5 py-0.5 text-xs font-medium text-accent-700">
                                    Isolated
                                  </span>
                                </div>
                              )
                            )}
                          </div>
                        )}
                        {index === 2 && (
                          <div className="space-y-4">
                            <div className="flex items-center gap-3">
                              <Zap className="h-6 w-6 text-brand-600" />
                              <span className="text-sm font-semibold text-gray-900">
                                Workflow Automation
                              </span>
                            </div>
                            <div className="flex items-center justify-between">
                              {["Trigger", "Condition", "Action", "Done"].map(
                                (step, i) => (
                                  <div key={step} className="flex items-center">
                                    <div className="flex flex-col items-center">
                                      <div
                                        className={cn(
                                          "flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold",
                                          i < 3
                                            ? "bg-brand-500 text-white"
                                            : "bg-brand-100 text-brand-700"
                                        )}
                                      >
                                        {i + 1}
                                      </div>
                                      <span className="mt-1.5 text-[10px] font-medium text-gray-500">
                                        {step}
                                      </span>
                                    </div>
                                    {i < 3 && (
                                      <div className="mx-1.5 h-0.5 w-6 bg-brand-200 sm:w-10" />
                                    )}
                                  </div>
                                )
                              )}
                            </div>
                            <div className="rounded-lg bg-brand-50 p-4">
                              <p className="text-xs font-medium text-brand-800">
                                When: Employee submits leave request
                              </p>
                              <p className="mt-1 text-xs text-brand-600">
                                Then: Notify manager, auto-approve if &le; 2 days
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/*  Stats                                                               */}
      {/* ------------------------------------------------------------------ */}
      <section className="relative overflow-hidden bg-gradient-dark py-24 sm:py-32">
        {/* Subtle dots overlay */}
        <div className="absolute inset-0 bg-dots opacity-20" />

        <div className="relative mx-auto max-w-7xl px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
              Built to scale with confidence
            </h2>
            <p className="mt-4 text-lg text-brand-200">
              Enterprise-grade infrastructure you can rely on, day after day.
            </p>
          </div>

          <div className="mx-auto mt-16 grid max-w-4xl grid-cols-2 gap-8 sm:grid-cols-4">
            {stats.map((stat) => (
              <div key={stat.label} className="text-center">
                <p className="text-4xl font-extrabold text-gradient sm:text-5xl">
                  {stat.value}
                </p>
                <p className="mt-2 text-sm font-medium text-gray-400">
                  {stat.label}
                </p>
              </div>
            ))}
          </div>

          <p className="mx-auto mt-14 max-w-lg text-center text-sm leading-relaxed text-gray-500">
            Every API call secured. Every table tenant-isolated. Every action
            audit-logged. Your data is in safe hands.
          </p>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/*  Final CTA                                                          */}
      {/* ------------------------------------------------------------------ */}
      <section className="relative overflow-hidden bg-gradient-to-br from-brand-600 via-brand-700 to-brand-900 py-24 sm:py-32">
        {/* Decorative blurred circles */}
        <div
          className="absolute -left-40 -top-40 h-80 w-80 rounded-full bg-brand-400/30 blur-3xl"
          aria-hidden="true"
        />
        <div
          className="absolute -bottom-40 -right-40 h-80 w-80 rounded-full bg-accent-400/20 blur-3xl"
          aria-hidden="true"
        />

        <div className="relative mx-auto max-w-3xl px-6 text-center lg:px-8">
          <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl lg:text-5xl">
            Ready to modernize your HR?
          </h2>
          <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-brand-100">
            Switch to a faster, smarter, and more human HR platform.
            Built on enterprise-grade infrastructure from day one.
          </p>

          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link
              to="/pricing"
              className="cursor-pointer inline-flex items-center gap-2 rounded-full bg-gradient-cta px-8 py-3.5 text-base font-semibold text-white shadow-lg shadow-accent-500/25 transition-all hover:shadow-accent-500/40 hover:-translate-y-0.5"
            >
              Get Started Free
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              to="/contact"
              className="cursor-pointer inline-flex items-center gap-2 rounded-full border-2 border-white/30 px-8 py-3.5 text-base font-semibold text-white transition-all hover:border-white/60 hover:bg-white/10"
            >
              Contact Sales
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
