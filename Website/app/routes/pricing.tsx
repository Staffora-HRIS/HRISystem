import { Fragment, useState } from "react";
import { Link } from "react-router";
import {
  Check,
  Minus,
  ChevronDown,
  Sparkles,
  ArrowRight,
  Users,
  Building2,
  Rocket,
  Crown,
  Globe,
} from "lucide-react";
import { cn } from "~/lib/utils";

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

interface Tier {
  name: string;
  slug: string;
  icon: React.ElementType;
  employees: string;
  monthlyPrice: number | null;
  annualPrice: number | null;
  description: string;
  features: string[];
  cta: string;
  ctaHref: string;
  popular?: boolean;
}

const tiers: Tier[] = [
  {
    name: "Starter",
    slug: "starter",
    icon: Rocket,
    employees: "1-10",
    annualPrice: 49,
    monthlyPrice: 59,
    description: "Perfect for small teams getting started",
    features: [
      "Core HR",
      "Leave Management",
      "Employee Self-Service",
      "Document Storage (5GB)",
      "Email Support",
      "1 Admin",
    ],
    cta: "Start Free Trial",
    ctaHref: "/contact",
  },
  {
    name: "Growth",
    slug: "growth",
    icon: Users,
    employees: "11-25",
    annualPrice: 99,
    monthlyPrice: 119,
    description: "For growing teams that need more",
    features: [
      "Everything in Starter",
      "Time & Attendance",
      "Performance Reviews",
      "Onboarding",
      "Recruitment (Basic)",
      "Document Storage (25GB)",
      "Priority Email Support",
      "3 Admins",
    ],
    cta: "Start Free Trial",
    ctaHref: "/contact",
    popular: true,
  },
  {
    name: "Professional",
    slug: "professional",
    icon: Building2,
    employees: "26-50",
    annualPrice: 199,
    monthlyPrice: 239,
    description: "Full-featured HR for scaling companies",
    features: [
      "Everything in Growth",
      "LMS",
      "Benefits Administration",
      "Workflow Automation",
      "Custom Reports",
      "API Access",
      "Document Storage (100GB)",
      "Phone + Email Support",
      "10 Admins",
    ],
    cta: "Start Free Trial",
    ctaHref: "/contact",
  },
  {
    name: "Business",
    slug: "business",
    icon: Crown,
    employees: "51-100",
    annualPrice: 399,
    monthlyPrice: 479,
    description: "Enterprise-grade for mid-size companies",
    features: [
      "Everything in Professional",
      "Succession Planning",
      "Advanced Analytics",
      "Custom Integrations",
      "SSO & MFA",
      "Audit Logging",
      "Unlimited Storage",
      "Dedicated Account Manager",
      "Unlimited Admins",
    ],
    cta: "Start Free Trial",
    ctaHref: "/contact",
  },
  {
    name: "Enterprise",
    slug: "enterprise",
    icon: Globe,
    employees: "100+",
    annualPrice: null,
    monthlyPrice: null,
    description: "Tailored solutions for large organizations",
    features: [
      "Everything in Business",
      "Custom SLA",
      "Dedicated Infrastructure",
      "Data Residency Options",
      "Custom Development",
      "On-site Training",
      "24/7 Phone Support",
    ],
    cta: "Contact Sales",
    ctaHref: "/contact",
  },
];

// ---------------------------------------------------------------------------
// Feature comparison table data
// ---------------------------------------------------------------------------

interface FeatureRow {
  name: string;
  tiers: (boolean | string)[];
}

interface FeatureCategory {
  category: string;
  features: FeatureRow[];
}

const featureComparison: FeatureCategory[] = [
  {
    category: "Core",
    features: [
      { name: "Employee Directory", tiers: [true, true, true, true, true] },
      { name: "Org Chart", tiers: [true, true, true, true, true] },
      { name: "Leave Management", tiers: [true, true, true, true, true] },
      { name: "Employee Self-Service", tiers: [true, true, true, true, true] },
      { name: "Document Storage", tiers: ["5GB", "25GB", "100GB", "Unlimited", "Unlimited"] },
      { name: "Custom Fields", tiers: [false, true, true, true, true] },
    ],
  },
  {
    category: "Time & Attendance",
    features: [
      { name: "Clock In/Out", tiers: [false, true, true, true, true] },
      { name: "Timesheets", tiers: [false, true, true, true, true] },
      { name: "Scheduling", tiers: [false, false, true, true, true] },
      { name: "Geo-Fencing", tiers: [false, false, true, true, true] },
    ],
  },
  {
    category: "Performance",
    features: [
      { name: "Performance Reviews", tiers: [false, true, true, true, true] },
      { name: "Goal Tracking", tiers: [false, true, true, true, true] },
      { name: "360 Feedback", tiers: [false, false, true, true, true] },
      { name: "Calibration", tiers: [false, false, false, true, true] },
    ],
  },
  {
    category: "Recruitment",
    features: [
      { name: "Job Postings", tiers: [false, true, true, true, true] },
      { name: "Applicant Tracking", tiers: [false, true, true, true, true] },
      { name: "Interview Scheduling", tiers: [false, false, true, true, true] },
      { name: "Offer Management", tiers: [false, false, true, true, true] },
    ],
  },
  {
    category: "Learning",
    features: [
      { name: "Course Management", tiers: [false, false, true, true, true] },
      { name: "Learning Paths", tiers: [false, false, true, true, true] },
      { name: "Certificates", tiers: [false, false, true, true, true] },
      { name: "SCORM Support", tiers: [false, false, false, true, true] },
    ],
  },
  {
    category: "Benefits",
    features: [
      { name: "Benefits Administration", tiers: [false, false, true, true, true] },
      { name: "Open Enrollment", tiers: [false, false, true, true, true] },
      { name: "Benefits Reporting", tiers: [false, false, false, true, true] },
    ],
  },
  {
    category: "Onboarding",
    features: [
      { name: "Onboarding Checklists", tiers: [false, true, true, true, true] },
      { name: "Document Collection", tiers: [false, true, true, true, true] },
      { name: "Custom Workflows", tiers: [false, false, true, true, true] },
      { name: "Automated Tasks", tiers: [false, false, true, true, true] },
    ],
  },
  {
    category: "Succession",
    features: [
      { name: "Succession Planning", tiers: [false, false, false, true, true] },
      { name: "Talent Pools", tiers: [false, false, false, true, true] },
      { name: "9-Box Grid", tiers: [false, false, false, true, true] },
    ],
  },
  {
    category: "Platform",
    features: [
      { name: "SSO / SAML", tiers: [false, false, false, true, true] },
      { name: "MFA", tiers: [false, false, false, true, true] },
      { name: "API Access", tiers: [false, false, true, true, true] },
      { name: "Audit Logging", tiers: [false, false, false, true, true] },
      { name: "Custom Integrations", tiers: [false, false, false, true, true] },
      { name: "Dedicated Infrastructure", tiers: [false, false, false, false, true] },
      { name: "Data Residency", tiers: [false, false, false, false, true] },
    ],
  },
  {
    category: "Support",
    features: [
      { name: "Email Support", tiers: [true, true, true, true, true] },
      { name: "Priority Support", tiers: [false, true, true, true, true] },
      { name: "Phone Support", tiers: [false, false, true, true, true] },
      { name: "Dedicated Account Manager", tiers: [false, false, false, true, true] },
      { name: "24/7 Phone Support", tiers: [false, false, false, false, true] },
      { name: "On-site Training", tiers: [false, false, false, false, true] },
    ],
  },
];

// ---------------------------------------------------------------------------
// FAQ data
// ---------------------------------------------------------------------------

interface FAQItem {
  question: string;
  answer: string;
}

const faqs: FAQItem[] = [
  {
    question: "What happens if I exceed my employee limit?",
    answer:
      "We'll notify you when you're approaching your plan's employee limit. You can upgrade to the next tier at any time. If you go over the limit, your existing data remains safe and accessible -- you'll just need to upgrade before adding more employees.",
  },
  {
    question: "Can I change plans at any time?",
    answer:
      "Yes, you can upgrade or downgrade your plan at any time. When upgrading, you'll get immediate access to new features and we'll prorate the difference. When downgrading, the change takes effect at the start of your next billing cycle.",
  },
  {
    question: "Is there a free trial?",
    answer:
      "Absolutely! Every plan comes with a 14-day free trial with full access to all features in that tier. No credit card required to start. You'll only be charged once your trial ends and you choose to continue.",
  },
  {
    question: "What payment methods do you accept?",
    answer:
      "We accept all major credit cards (Visa, Mastercard, American Express), ACH bank transfers, and wire transfers for annual plans. Enterprise customers can also pay by invoice with NET-30 terms.",
  },
  {
    question: "Do you offer discounts for nonprofits?",
    answer:
      "Yes, we offer a 25% discount on all plans for verified nonprofit organizations. Contact our sales team with proof of nonprofit status and we'll apply the discount to your account.",
  },
  {
    question: "What's included in the free trial?",
    answer:
      "The free trial includes full access to every feature in your selected plan. You can import employee data, configure workflows, test integrations, and explore the platform without limitations. At the end of the trial, you can subscribe to keep your data or export it.",
  },
  {
    question: "How does billing work?",
    answer:
      "You can choose monthly or annual billing. Annual billing saves you up to 17% compared to monthly pricing. Invoices are generated at the beginning of each billing cycle and payment is processed automatically via your chosen payment method.",
  },
  {
    question: "Can I cancel anytime?",
    answer:
      "Yes, you can cancel your subscription at any time with no cancellation fees. Your account will remain active until the end of your current billing period. After cancellation, you'll have 30 days to export your data before it's permanently deleted.",
  },
];

// ---------------------------------------------------------------------------
// Tier names for the comparison table header
// ---------------------------------------------------------------------------

const tierNames = tiers.map((t) => t.name);

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PricingPage() {
  const [annual, setAnnual] = useState(true);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <div className="overflow-hidden">
      {/* ---------------------------------------------------------------- */}
      {/* Hero */}
      {/* ---------------------------------------------------------------- */}
      <section className="relative bg-grid">
        {/* Decorative gradient blobs */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -top-40 -right-40 h-[500px] w-[500px] rounded-full bg-brand-400/10 blur-3xl" />
          <div className="absolute -bottom-40 -left-40 h-[400px] w-[400px] rounded-full bg-brand-300/10 blur-3xl" />
        </div>

        <div className="relative mx-auto max-w-7xl px-6 pb-16 pt-24 text-center lg:px-8 lg:pt-32">
          <div className="animate-fade-in-up">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-4 py-1.5 text-sm font-medium text-brand-700 ring-1 ring-brand-200/60">
              <Sparkles className="h-3.5 w-3.5" />
              14-day free trial on all plans
            </span>
          </div>

          <h1 className="mt-8 text-4xl font-extrabold tracking-tight sm:text-5xl lg:text-6xl animate-fade-in-up">
            Simple, transparent{" "}
            <span className="text-gradient">pricing</span>
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-lg text-gray-600 animate-fade-in-up sm:text-xl">
            Choose the plan that fits your team size. No hidden fees, no
            surprises. Scale as you grow.
          </p>

          {/* Annual / Monthly toggle */}
          <div className="mt-10 flex items-center justify-center gap-4 animate-fade-in-up">
            <span
              className={cn(
                "text-sm font-medium transition",
                !annual ? "text-gray-900" : "text-gray-400"
              )}
            >
              Monthly
            </span>

            <button
              type="button"
              role="switch"
              aria-checked={annual}
              aria-label="Toggle annual billing"
              onClick={() => setAnnual(!annual)}
              className={cn(
                "relative inline-flex h-7 w-[52px] shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2",
                annual ? "bg-brand-600" : "bg-gray-300"
              )}
            >
              <span
                className={cn(
                  "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition-transform duration-200",
                  annual ? "translate-x-[27px]" : "translate-x-1"
                )}
              />
            </button>

            <span
              className={cn(
                "text-sm font-medium transition",
                annual ? "text-gray-900" : "text-gray-400"
              )}
            >
              Annual
              <span className="ml-1.5 inline-block rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">
                Save up to 17%
              </span>
            </span>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Pricing Cards */}
      {/* ---------------------------------------------------------------- */}
      <section className="relative -mt-4">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {tiers.map((tier) => {
              const price = annual ? tier.annualPrice : tier.monthlyPrice;
              const isCustom = price === null;
              const Icon = tier.icon;

              return (
                <div
                  key={tier.slug}
                  className={cn(
                    "relative flex flex-col cursor-pointer rounded-2xl border bg-white p-6 shadow-sm transition-all duration-300 hover:shadow-xl hover:-translate-y-1",
                    tier.popular
                      ? "border-accent-400 shadow-accent-200/50 ring-2 ring-accent-400 lg:scale-105 lg:z-10"
                      : "border-gray-200"
                  )}
                >
                  {/* Most Popular badge */}
                  {tier.popular && (
                    <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                      <span className="inline-flex items-center gap-1 rounded-full bg-gradient-cta px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-white shadow-lg shadow-accent-500/25">
                        <Sparkles className="h-3 w-3" />
                        Most Popular
                      </span>
                    </div>
                  )}

                  {/* Tier header */}
                  <div className="mb-4">
                    <div
                      className={cn(
                        "mb-3 flex h-10 w-10 items-center justify-center rounded-xl",
                        tier.popular
                          ? "bg-gradient-brand text-white shadow-lg shadow-brand-500/25"
                          : "bg-brand-50 text-brand-600"
                      )}
                    >
                      <Icon className="h-5 w-5" />
                    </div>
                    <h3 className="text-lg font-bold text-gray-900">
                      {tier.name}
                    </h3>
                    <p className="mt-0.5 text-sm text-gray-500">
                      {tier.employees} employees
                    </p>
                  </div>

                  {/* Price */}
                  <div className="mb-4">
                    {isCustom ? (
                      <div className="flex items-baseline gap-1">
                        <span className="text-4xl font-extrabold tracking-tight text-gray-900">
                          Custom
                        </span>
                      </div>
                    ) : (
                      <div>
                        <div className="flex items-baseline gap-1">
                          <span className="text-4xl font-extrabold tracking-tight text-gray-900">
                            ${price}
                          </span>
                          <span className="text-sm text-gray-500">/month</span>
                        </div>
                        {annual && tier.monthlyPrice !== null && (
                          <p className="mt-1 text-xs text-gray-400">
                            <span className="line-through">
                              ${tier.monthlyPrice}/mo
                            </span>{" "}
                            billed annually
                          </p>
                        )}
                        {!annual && tier.annualPrice !== null && (
                          <p className="mt-1 text-xs text-green-600">
                            Save ${(price! - tier.annualPrice) * 12}/yr with
                            annual billing
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Description */}
                  <p className="mb-6 text-sm text-gray-500">
                    {tier.description}
                  </p>

                  {/* Feature list */}
                  <ul className="mb-8 flex-1 space-y-3" role="list">
                    {tier.features.map((feature) => (
                      <li
                        key={feature}
                        className="flex items-start gap-2 text-sm text-gray-700"
                      >
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" />
                        {feature}
                      </li>
                    ))}
                  </ul>

                  {/* CTA */}
                  <Link
                    to={tier.ctaHref}
                    className={cn(
                      "flex items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-semibold transition-all duration-200",
                      tier.popular
                        ? "bg-gradient-cta text-white shadow-lg shadow-accent-500/25 hover:shadow-accent-500/40 hover:-translate-y-0.5"
                        : tier.slug === "enterprise"
                          ? "bg-gray-900 text-white hover:bg-gray-800"
                          : "bg-brand-50 text-brand-700 hover:bg-brand-100"
                    )}
                  >
                    {tier.cta}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Feature Comparison Table */}
      {/* ---------------------------------------------------------------- */}
      <section className="mt-32">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="text-center">
            <h2 className="text-3xl font-extrabold tracking-tight text-gray-900 sm:text-4xl">
              Compare all features
            </h2>
            <p className="mt-4 text-lg text-gray-600">
              See exactly what you get with each plan
            </p>
          </div>

          <div className="mt-12 overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm">
            <table className="w-full min-w-[800px] text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="sticky left-0 bg-gray-50 px-6 py-4 text-sm font-semibold text-gray-900 min-w-[200px]">
                    Feature
                  </th>
                  {tierNames.map((name) => (
                    <th
                      key={name}
                      className={cn(
                        "px-4 py-4 text-center text-sm font-semibold",
                        name === "Growth" ? "text-brand-700" : "text-gray-900"
                      )}
                    >
                      {name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {featureComparison.map((category) => (
                  <Fragment key={category.category}>
                    {/* Category header row */}
                    <tr
                      className="border-b border-gray-100 bg-gray-50/50"
                    >
                      <td
                        colSpan={tierNames.length + 1}
                        className="px-6 py-3 text-xs font-bold uppercase tracking-wider text-gray-500"
                      >
                        {category.category}
                      </td>
                    </tr>

                    {/* Feature rows */}
                    {category.features.map((feature) => (
                      <tr
                        key={feature.name}
                        className="border-b border-gray-100 last:border-0 hover:bg-gray-50/50 transition-colors"
                      >
                        <td className="sticky left-0 bg-white px-6 py-3.5 text-sm text-gray-700">
                          {feature.name}
                        </td>
                        {feature.tiers.map((value, i) => (
                          <td
                            key={`${feature.name}-${tierNames[i]}`}
                            className={cn(
                              "px-4 py-3.5 text-center",
                              tierNames[i] === "Growth" && "bg-brand-50/30"
                            )}
                          >
                            {value === true ? (
                              <Check
                                className="mx-auto h-5 w-5 text-brand-500"
                                aria-label="Included"
                              />
                            ) : value === false ? (
                              <Minus
                                className="mx-auto h-5 w-5 text-gray-300"
                                aria-label="Not included"
                              />
                            ) : (
                              <span className="text-sm font-medium text-gray-700">
                                {value}
                              </span>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* FAQ Section */}
      {/* ---------------------------------------------------------------- */}
      <section className="mt-32">
        <div className="mx-auto max-w-3xl px-6 lg:px-8">
          <div className="text-center">
            <h2 className="text-3xl font-extrabold tracking-tight text-gray-900 sm:text-4xl">
              Frequently asked questions
            </h2>
            <p className="mt-4 text-lg text-gray-600">
              Everything you need to know about our pricing and plans
            </p>
          </div>

          <dl className="mt-12 space-y-4">
            {faqs.map((faq, index) => {
              const isOpen = openFaq === index;

              return (
                <div
                  key={faq.question}
                  className={cn(
                    "rounded-xl border transition-all duration-200",
                    isOpen
                      ? "border-brand-200 bg-brand-50/30 shadow-sm"
                      : "border-gray-200 bg-white hover:border-gray-300"
                  )}
                >
                  <dt>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 rounded-xl"
                      onClick={() => setOpenFaq(isOpen ? null : index)}
                      aria-expanded={isOpen}
                    >
                      <span className="text-base font-semibold text-gray-900">
                        {faq.question}
                      </span>
                      <ChevronDown
                        className={cn(
                          "h-5 w-5 shrink-0 text-gray-400 transition-transform duration-200",
                          isOpen && "rotate-180 text-brand-500"
                        )}
                      />
                    </button>
                  </dt>
                  {isOpen && (
                    <dd className="px-6 pb-5 animate-fade-in">
                      <p className="text-sm leading-relaxed text-gray-600">
                        {faq.answer}
                      </p>
                    </dd>
                  )}
                </div>
              );
            })}
          </dl>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Bottom CTA */}
      {/* ---------------------------------------------------------------- */}
      <section className="mt-32 mb-20">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="relative overflow-hidden rounded-3xl bg-gradient-dark px-8 py-20 text-center shadow-2xl sm:px-16">
            {/* Decorative elements */}
            <div className="pointer-events-none absolute inset-0 bg-grid opacity-10" />
            <div className="pointer-events-none absolute -top-24 left-1/2 h-[400px] w-[600px] -translate-x-1/2 rounded-full bg-brand-500/20 blur-3xl" />

            <div className="relative">
              <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
                Not sure which plan?{" "}
                <span className="text-brand-300">Let's talk.</span>
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-lg text-gray-300">
                Our team will help you find the right plan for your
                organization. No pressure, no obligations.
              </p>
              <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
                <Link
                  to="/contact"
                  className="cursor-pointer inline-flex items-center gap-2 rounded-full bg-gradient-cta px-8 py-3.5 text-sm font-semibold text-white shadow-lg shadow-accent-500/25 transition-all hover:-translate-y-0.5 hover:shadow-accent-500/40"
                >
                  Talk to Sales
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  to="/contact"
                  className="inline-flex items-center gap-2 rounded-full border border-white/20 px-8 py-3.5 text-sm font-semibold text-white transition hover:bg-white/10"
                >
                  Start Free Trial
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
