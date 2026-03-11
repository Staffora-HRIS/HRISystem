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
  TrendingUp,
  Shield,
  Lock,
  FileText,
  Code2,
  Bell,
  GitBranch,
  KeyRound,
  ArrowRight,
  Check,
  Building2,
  CloudCog,
  Fingerprint,
  type LucideIcon,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

interface Module {
  icon: LucideIcon;
  title: string;
  description: string;
  capabilities: string[];
  mockup: React.ReactNode;
}

const modules: Module[] = [
  {
    icon: Users,
    title: "Core HR",
    description:
      "A single source of truth for all employee data. Manage profiles, organizational structures, and documents with full version history and effective-dated records.",
    capabilities: [
      "Employee profiles & custom fields",
      "Org chart visualization",
      "Contract management",
      "Document storage & indexing",
      "Effective-dated records",
      "Multi-entity support",
    ],
    mockup: <CoreHRMockup />,
  },
  {
    icon: Clock,
    title: "Time & Attendance",
    description:
      "Track working hours with precision. GPS-enabled clock-in, flexible scheduling, and streamlined approvals keep your workforce accountable and compliant.",
    capabilities: [
      "GPS clock-in & geofencing",
      "Visual schedule builder",
      "Timesheet approval workflows",
      "Overtime tracking & alerts",
      "Shift management",
      "Real-time attendance dashboard",
    ],
    mockup: <TimeAttendanceMockup />,
  },
  {
    icon: CalendarDays,
    title: "Leave Management",
    description:
      "Automate leave policies end to end. Configurable accrual rules, intuitive team calendars, and multi-level approval workflows reduce manual effort.",
    capabilities: [
      "Configurable leave types",
      "Accrual rules engine",
      "Team calendar view",
      "Multi-level approval workflows",
      "Real-time balance tracking",
      "Holiday calendar management",
    ],
    mockup: <LeaveMockup />,
  },
  {
    icon: Target,
    title: "Performance Management",
    description:
      "Drive growth with structured review cycles, OKR tracking, and calibration sessions. Empower managers with 360-degree feedback and competency frameworks.",
    capabilities: [
      "Customizable review cycles",
      "Goal setting with OKRs",
      "360-degree feedback",
      "Calibration sessions",
      "Competency frameworks",
      "Performance analytics",
    ],
    mockup: <PerformanceMockup />,
  },
  {
    icon: Briefcase,
    title: "Recruitment",
    description:
      "Hire smarter and faster. Manage requisitions, track candidates through a visual pipeline, schedule interviews, and extend offers, all from one place.",
    capabilities: [
      "Job requisitions & postings",
      "Visual candidate pipeline",
      "Interview scheduling",
      "Offer management",
      "Hiring analytics",
      "Collaborative scoring",
    ],
    mockup: <RecruitmentMockup />,
  },
  {
    icon: GraduationCap,
    title: "Learning Management",
    description:
      "Build a culture of continuous learning. Create courses, define learning paths, track certifications, and ensure compliance training is never missed.",
    capabilities: [
      "Drag-and-drop course builder",
      "Learning paths & curricula",
      "Certification tracking",
      "Compliance training",
      "Progress dashboards",
      "Quiz & assessment engine",
    ],
    mockup: <LMSMockup />,
  },
  {
    icon: Heart,
    title: "Benefits Administration",
    description:
      "Simplify benefits enrollment and management. Compare plan costs, handle life events automatically, and manage carrier connections with ease.",
    capabilities: [
      "Plan enrollment portal",
      "Life event processing",
      "Side-by-side cost comparison",
      "Open enrollment management",
      "Carrier data integration",
      "Dependent management",
    ],
    mockup: <BenefitsMockup />,
  },
  {
    icon: ClipboardCheck,
    title: "Onboarding",
    description:
      "Make first impressions count. Template-driven checklists, automated task assignment, and welcome workflows get new hires productive from day one.",
    capabilities: [
      "Template checklists",
      "Automated task assignment",
      "Document collection & e-sign",
      "Welcome workflows",
      "Progress tracking",
      "Pre-boarding portal",
    ],
    mockup: <OnboardingMockup />,
  },
  {
    icon: TrendingUp,
    title: "Succession Planning",
    description:
      "Prepare for tomorrow, today. Identify high-potential talent, assess readiness, and build development plans to ensure leadership continuity.",
    capabilities: [
      "Talent pool management",
      "Readiness assessment",
      "Interactive 9-box grid",
      "Flight risk analysis",
      "Development plans",
      "Scenario modeling",
    ],
    mockup: <SuccessionMockup />,
  },
];

interface PlatformFeature {
  icon: LucideIcon;
  title: string;
  description: string;
}

const platformFeatures: PlatformFeature[] = [
  {
    icon: Building2,
    title: "Multi-Tenant Architecture",
    description:
      "Complete data isolation per tenant with row-level security. Each organization operates in its own secure space.",
  },
  {
    icon: Shield,
    title: "Role-Based Access Control",
    description:
      "Granular permissions down to the field level. Define custom roles and control exactly who sees what.",
  },
  {
    icon: FileText,
    title: "Audit Logging",
    description:
      "Every action is tracked with immutable audit logs. Full visibility into who changed what, and when.",
  },
  {
    icon: Code2,
    title: "API-First Design",
    description:
      "Over 200 RESTful endpoints. Build custom integrations, automate workflows, and extend the platform your way.",
  },
  {
    icon: Bell,
    title: "Real-Time Notifications",
    description:
      "Keep everyone informed with in-app, email, and push notifications. Configurable per event and per user.",
  },
  {
    icon: GitBranch,
    title: "Workflow Automation",
    description:
      "Visual workflow builder for approvals, escalations, and task routing. Eliminate bottlenecks automatically.",
  },
  {
    icon: Lock,
    title: "Encryption at Rest & Transit",
    description:
      "AES-256 encryption for stored data and TLS 1.3 for all communications. Your data is always protected.",
  },
  {
    icon: KeyRound,
    title: "SSO & MFA Support",
    description:
      "Integrate with your identity provider via SAML/OIDC. Enforce multi-factor authentication for extra security.",
  },
];

interface ApiCapability {
  icon: LucideIcon;
  title: string;
  details: string[];
}

const apiCapabilities: ApiCapability[] = [
  {
    icon: Code2,
    title: "RESTful API",
    details: ["200+ endpoints", "Cursor-based pagination", "TypeBox validation"],
  },
  {
    icon: Shield,
    title: "Authentication",
    details: ["Session management", "MFA support", "CSRF protection"],
  },
  {
    icon: Bell,
    title: "Event System",
    details: ["Domain events", "Redis Streams", "Transactional outbox"],
  },
  {
    icon: CloudCog,
    title: "Background Jobs",
    details: ["PDF generation", "Email notifications", "Data exports"],
  },
  {
    icon: Fingerprint,
    title: "Idempotency",
    details: ["Request deduplication", "Unique key scoping", "24-72h expiration"],
  },
];

// ---------------------------------------------------------------------------
// Mockup Components (abstract UI cards)
// ---------------------------------------------------------------------------

function MockupShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="glass-card rounded-2xl overflow-hidden">
      {/* Title bar */}
      <div className="flex items-center gap-1.5 border-b border-gray-100 px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
        <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
        <span className="h-2.5 w-2.5 rounded-full bg-green-400" />
        <span className="ml-3 h-3 w-24 rounded bg-gray-100" />
      </div>
      <div className="p-4 space-y-3">{children}</div>
    </div>
  );
}

function BarChart({ bars }: { bars: { h: string; color: string }[] }) {
  return (
    <div className="flex items-end gap-1.5 h-20">
      {bars.map((b, i) => (
        <div
          key={i}
          className={`w-4 rounded-t ${b.color}`}
          style={{ height: b.h }}
        />
      ))}
    </div>
  );
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: string;
}) {
  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50/50 p-3">
      <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">
        {label}
      </p>
      <p className={`text-lg font-bold ${accent}`}>{value}</p>
    </div>
  );
}

function CoreHRMockup() {
  return (
    <MockupShell>
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-full bg-brand-100 flex items-center justify-center">
          <Users className="h-5 w-5 text-brand-600" />
        </div>
        <div>
          <div className="h-3 w-28 rounded bg-gray-200" />
          <div className="mt-1.5 h-2 w-20 rounded bg-gray-100" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <StatCard label="Employees" value="—" accent="text-brand-600" />
        <StatCard label="Departments" value="—" accent="text-violet-600" />
      </div>
      <div className="space-y-2">
        {["Engineering", "Product", "Sales"].map((d) => (
          <div
            key={d}
            className="flex items-center justify-between rounded-md bg-gray-50 px-3 py-2"
          >
            <span className="text-xs font-medium text-gray-600">{d}</span>
            <span className="h-2 w-12 rounded-full bg-brand-200" />
          </div>
        ))}
      </div>
    </MockupShell>
  );
}

function TimeAttendanceMockup() {
  return (
    <MockupShell>
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-gray-700">Today's Attendance</p>
        <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-700">
          Live
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <StatCard label="Present" value="—" accent="text-green-600" />
        <StatCard label="Late" value="—" accent="text-amber-600" />
        <StatCard label="Absent" value="—" accent="text-red-500" />
      </div>
      <BarChart
        bars={[
          { h: "60%", color: "bg-brand-400" },
          { h: "80%", color: "bg-brand-500" },
          { h: "100%", color: "bg-brand-600" },
          { h: "70%", color: "bg-brand-500" },
          { h: "90%", color: "bg-brand-600" },
          { h: "50%", color: "bg-brand-400" },
          { h: "30%", color: "bg-brand-300" },
        ]}
      />
    </MockupShell>
  );
}

function LeaveMockup() {
  return (
    <MockupShell>
      <p className="text-xs font-semibold text-gray-700">Team Calendar</p>
      <div className="grid grid-cols-7 gap-1">
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
          <span
            key={i}
            className="text-center text-[9px] font-medium text-gray-400"
          >
            {d}
          </span>
        ))}
        {Array.from({ length: 14 }, (_, i) => {
          const isHighlight = [2, 3, 4, 9, 10].includes(i);
          return (
            <div
              key={i}
              className={`h-6 rounded text-center text-[10px] leading-6 ${
                isHighlight
                  ? "bg-brand-100 text-brand-700 font-semibold"
                  : "bg-gray-50 text-gray-500"
              }`}
            >
              {i + 1}
            </div>
          );
        })}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <StatCard label="PTO Balance" value="—" accent="text-brand-600" />
        <StatCard label="Pending" value="—" accent="text-amber-600" />
      </div>
    </MockupShell>
  );
}

function PerformanceMockup() {
  return (
    <MockupShell>
      <p className="text-xs font-semibold text-gray-700">Q1 Review Cycle</p>
      <div className="space-y-2">
        {[
          { label: "Self Review", pct: "100%", color: "bg-green-500" },
          { label: "Manager Review", pct: "72%", color: "bg-brand-500" },
          { label: "Calibration", pct: "0%", color: "bg-gray-200" },
        ].map((s) => (
          <div key={s.label}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-medium text-gray-500">
                {s.label}
              </span>
              <span className="text-[10px] font-semibold text-gray-700">
                {s.pct}
              </span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-gray-100">
              <div
                className={`h-1.5 rounded-full ${s.color}`}
                style={{ width: s.pct }}
              />
            </div>
          </div>
        ))}
      </div>
      <StatCard label="Avg Rating" value="— / 5" accent="text-brand-600" />
    </MockupShell>
  );
}

function RecruitmentMockup() {
  return (
    <MockupShell>
      <p className="text-xs font-semibold text-gray-700">Hiring Pipeline</p>
      <div className="flex gap-2">
        {[
          { label: "Applied", count: "—", color: "bg-gray-200" },
          { label: "Screen", count: "—", color: "bg-blue-200" },
          { label: "Interview", count: "—", color: "bg-brand-200" },
          { label: "Offer", count: "—", color: "bg-green-200" },
        ].map((s) => (
          <div
            key={s.label}
            className={`flex-1 rounded-lg ${s.color} p-2 text-center`}
          >
            <p className="text-sm font-bold text-gray-800">{s.count}</p>
            <p className="text-[9px] font-medium text-gray-500">{s.label}</p>
          </div>
        ))}
      </div>
      <div className="space-y-1.5">
        {["Sr. Engineer", "Product Manager", "UX Designer"].map((role) => (
          <div
            key={role}
            className="flex items-center justify-between rounded-md bg-gray-50 px-3 py-2"
          >
            <span className="text-xs font-medium text-gray-600">{role}</span>
            <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[9px] font-semibold text-brand-700">
              Active
            </span>
          </div>
        ))}
      </div>
    </MockupShell>
  );
}

function LMSMockup() {
  return (
    <MockupShell>
      <p className="text-xs font-semibold text-gray-700">Learning Dashboard</p>
      <div className="grid grid-cols-2 gap-2">
        <StatCard label="Courses" value="—" accent="text-brand-600" />
        <StatCard label="Completion" value="—" accent="text-green-600" />
      </div>
      <div className="space-y-2">
        {[
          { title: "Security Awareness", progress: "90%" },
          { title: "Leadership 101", progress: "45%" },
          { title: "Data Privacy", progress: "100%" },
        ].map((c) => (
          <div key={c.title} className="rounded-md bg-gray-50 px-3 py-2">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-medium text-gray-600">
                {c.title}
              </span>
              <span className="text-[10px] font-semibold text-gray-500">
                {c.progress}
              </span>
            </div>
            <div className="h-1 w-full rounded-full bg-gray-200">
              <div
                className="h-1 rounded-full bg-brand-500"
                style={{ width: c.progress }}
              />
            </div>
          </div>
        ))}
      </div>
    </MockupShell>
  );
}

function BenefitsMockup() {
  return (
    <MockupShell>
      <p className="text-xs font-semibold text-gray-700">Plan Comparison</p>
      <div className="grid grid-cols-2 gap-2">
        {[
          {
            plan: "Basic",
            price: "$120/mo",
            highlight: false,
          },
          {
            plan: "Premium",
            price: "$240/mo",
            highlight: true,
          },
        ].map((p) => (
          <div
            key={p.plan}
            className={`rounded-lg border p-3 text-center ${
              p.highlight
                ? "border-brand-300 bg-brand-50"
                : "border-gray-100 bg-gray-50/50"
            }`}
          >
            <p className="text-[10px] font-medium text-gray-400 uppercase">
              {p.plan}
            </p>
            <p
              className={`text-sm font-bold ${
                p.highlight ? "text-brand-600" : "text-gray-700"
              }`}
            >
              {p.price}
            </p>
          </div>
        ))}
      </div>
      <StatCard label="Enrolled" value="—" accent="text-brand-600" />
    </MockupShell>
  );
}

function OnboardingMockup() {
  return (
    <MockupShell>
      <p className="text-xs font-semibold text-gray-700">Onboarding Progress</p>
      <div className="space-y-2">
        {[
          { task: "Sign offer letter", done: true },
          { task: "Upload ID documents", done: true },
          { task: "Complete tax forms", done: true },
          { task: "Setup workstation", done: false },
          { task: "Meet your team", done: false },
        ].map((t) => (
          <div
            key={t.task}
            className="flex items-center gap-2 rounded-md bg-gray-50 px-3 py-2"
          >
            <div
              className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${
                t.done
                  ? "bg-green-500 text-white"
                  : "border border-gray-300 bg-white"
              }`}
            >
              {t.done && <Check className="h-2.5 w-2.5" />}
            </div>
            <span
              className={`text-xs ${
                t.done
                  ? "text-gray-400 line-through"
                  : "font-medium text-gray-600"
              }`}
            >
              {t.task}
            </span>
          </div>
        ))}
      </div>
    </MockupShell>
  );
}

function SuccessionMockup() {
  return (
    <MockupShell>
      <p className="text-xs font-semibold text-gray-700">9-Box Grid</p>
      <div className="grid grid-cols-3 gap-1">
        {[
          { label: "Star", bg: "bg-green-100", text: "text-green-700", count: 5 },
          { label: "Growth", bg: "bg-green-50", text: "text-green-600", count: 8 },
          { label: "Enigma", bg: "bg-amber-50", text: "text-amber-600", count: 3 },
          { label: "High Pro", bg: "bg-blue-100", text: "text-blue-700", count: 12 },
          { label: "Core", bg: "bg-gray-100", text: "text-gray-600", count: 24 },
          { label: "Dilemma", bg: "bg-amber-100", text: "text-amber-700", count: 2 },
          { label: "Trusted", bg: "bg-blue-50", text: "text-blue-600", count: 9 },
          { label: "Effective", bg: "bg-gray-50", text: "text-gray-500", count: 15 },
          { label: "Risk", bg: "bg-red-50", text: "text-red-500", count: 1 },
        ].map((cell) => (
          <div
            key={cell.label}
            className={`rounded ${cell.bg} p-2 text-center`}
          >
            <p className={`text-sm font-bold ${cell.text}`}>{cell.count}</p>
            <p className="text-[8px] font-medium text-gray-400">{cell.label}</p>
          </div>
        ))}
      </div>
      <StatCard label="Ready Now" value="—" accent="text-green-600" />
    </MockupShell>
  );
}

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------

export default function FeaturesPage() {
  return (
    <>
      {/* ----------------------------------------------------------------- */}
      {/* Hero */}
      {/* ----------------------------------------------------------------- */}
      <section className="relative overflow-hidden bg-gradient-to-b from-brand-50/60 via-white to-white">
        {/* Decorative background */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-grid"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-40 right-0 h-[500px] w-[500px] rounded-full bg-brand-400/10 blur-3xl"
        />

        <div className="relative mx-auto max-w-7xl px-6 py-24 text-center lg:px-8 lg:py-32">
          <h1 className="mx-auto max-w-3xl text-4xl font-extrabold tracking-tight sm:text-5xl lg:text-6xl animate-fade-in">
            Powerful features for{" "}
            <span className="text-gradient">modern HR teams</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-gray-600 leading-relaxed animate-fade-in-up">
            From hiring to retiring &mdash; manage every stage of the employee
            lifecycle with an integrated, enterprise-grade platform.
          </p>
        </div>
      </section>

      {/* ----------------------------------------------------------------- */}
      {/* Module Sections (alternating layout) */}
      {/* ----------------------------------------------------------------- */}
      {modules.map((mod, idx) => {
        const reversed = idx % 2 === 1;
        const Icon = mod.icon;

        return (
          <section
            key={mod.title}
            id={mod.title.toLowerCase().replace(/\s+/g, "-")}
            className={`py-20 lg:py-28 ${
              idx % 2 === 0 ? "bg-white" : "bg-gray-50/60"
            }`}
          >
            <div className="mx-auto max-w-7xl px-6 lg:px-8">
              <div
                className={`flex flex-col items-center gap-12 lg:gap-20 ${
                  reversed ? "lg:flex-row-reverse" : "lg:flex-row"
                }`}
              >
                {/* Text side */}
                <div className="flex-1 max-w-xl">
                  <div className="inline-flex items-center gap-2 rounded-full bg-brand-50 px-4 py-1.5 text-sm font-semibold text-brand-700">
                    <Icon className="h-4 w-4" aria-hidden="true" />
                    {mod.title}
                  </div>
                  <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-gray-900 sm:text-4xl">
                    {mod.title}
                  </h2>
                  <p className="mt-4 text-base text-gray-600 leading-relaxed">
                    {mod.description}
                  </p>
                  <ul className="mt-8 space-y-3">
                    {mod.capabilities.map((cap) => (
                      <li key={cap} className="flex items-start gap-3">
                        <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-100 text-accent-600">
                          <Check className="h-3 w-3" aria-hidden="true" />
                        </span>
                        <span className="text-sm text-gray-700">{cap}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Mockup side */}
                <div className="flex-1 w-full max-w-md lg:max-w-lg animate-float">
                  {mod.mockup}
                </div>
              </div>
            </div>
          </section>
        );
      })}

      {/* ----------------------------------------------------------------- */}
      {/* Platform Features Grid */}
      {/* ----------------------------------------------------------------- */}
      <section
        id="security"
        className="relative overflow-hidden bg-gradient-dark py-24 lg:py-32"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-dots opacity-30"
        />
        <div className="relative mx-auto max-w-7xl px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
              Built on a{" "}
              <span className="text-brand-300">rock-solid platform</span>
            </h2>
            <p className="mt-4 text-base text-gray-400 leading-relaxed">
              Enterprise-grade infrastructure and security baked into every
              layer, so you can focus on your people.
            </p>
          </div>

          <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {platformFeatures.map((feat) => {
              const FeatIcon = feat.icon;
              return (
                <div
                  key={feat.title}
                  className="group rounded-2xl border border-gray-700/40 bg-gray-900/60 p-6 backdrop-blur transition hover:border-brand-500/50 hover:bg-gray-800/60"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500/10 text-brand-400 transition group-hover:bg-brand-500/20">
                    <FeatIcon className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <h3 className="mt-4 text-sm font-semibold text-white">
                    {feat.title}
                  </h3>
                  <p className="mt-2 text-sm text-gray-400 leading-relaxed">
                    {feat.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------------------- */}
      {/* API & Developer Platform */}
      {/* ----------------------------------------------------------------- */}
      <section id="integrations" className="bg-white py-24 lg:py-32">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-extrabold tracking-tight text-gray-900 sm:text-4xl">
              API-first{" "}
              <span className="text-gradient">developer platform</span>
            </h2>
            <p className="mt-4 text-base text-gray-600 leading-relaxed">
              200+ RESTful endpoints with full TypeBox validation, cursor-based
              pagination, and idempotency support. Build custom integrations
              and extend the platform your way.
            </p>
          </div>

          <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-5">
            {apiCapabilities.map((cap) => {
              const CapIcon = cap.icon;
              return (
                <div
                  key={cap.title}
                  className="rounded-2xl border border-gray-200 bg-gray-50/50 p-6 text-center transition hover:border-brand-200 hover:shadow-lg hover:shadow-brand-100/40"
                >
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                    <CapIcon className="h-6 w-6" aria-hidden="true" />
                  </div>
                  <h3 className="mt-4 text-sm font-semibold text-gray-900">
                    {cap.title}
                  </h3>
                  <ul className="mt-3 space-y-1">
                    {cap.details.map((detail) => (
                      <li
                        key={detail}
                        className="text-xs text-gray-500"
                      >
                        {detail}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------------------- */}
      {/* CTA */}
      {/* ----------------------------------------------------------------- */}
      <section className="relative overflow-hidden bg-gradient-to-b from-brand-50/40 via-white to-white">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-grid"
        />
        <div className="relative mx-auto max-w-7xl px-6 py-24 text-center lg:px-8 lg:py-32">
          <h2 className="text-3xl font-extrabold tracking-tight text-gray-900 sm:text-4xl">
            See it in action
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-base text-gray-600 leading-relaxed">
            Ready to transform how your team manages people? Get a personalized
            demo or explore our pricing to find the right plan.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link
              to="/contact"
              className="cursor-pointer inline-flex items-center gap-2 rounded-full bg-gradient-cta px-8 py-3.5 text-sm font-semibold text-white shadow-lg shadow-accent-500/25 transition-all hover:shadow-accent-500/40 hover:-translate-y-0.5"
            >
              Request a Demo
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <Link
              to="/pricing"
              className="inline-flex items-center gap-2 rounded-full border border-gray-300 bg-white px-8 py-3.5 text-sm font-semibold text-gray-700 transition hover:border-brand-300 hover:text-brand-700"
            >
              View Pricing
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
