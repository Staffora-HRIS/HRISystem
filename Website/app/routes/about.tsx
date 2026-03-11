import { Link } from "react-router";
import {
  Shield,
  Sparkles,
  Eye,
  Heart,
  ArrowRight,
  Code2,
  Database,
  Server,
  Zap,
} from "lucide-react";

const timeline = [
  {
    label: "The Problem",
    description:
      "HR tools are either too simple for growing teams or too complex for anyone without a dedicated IT department. There had to be a better way.",
  },
  {
    label: "The Solution",
    description:
      "Build a modular platform that starts simple and scales with your team. Pick the modules you need, skip the ones you don't.",
  },
  {
    label: "The Launch",
    description:
      "We launched with Core HR and expanded to 13+ modules — time tracking, leave management, talent, LMS, recruitment, benefits, and more.",
  },
  {
    label: "The Future",
    description:
      "AI-powered insights, global compliance automation, and an open ecosystem so you can build on top of the platform.",
  },
];

const values = [
  {
    icon: Shield,
    title: "Security First",
    description:
      "Your data is sacred. Row-level security, end-to-end encryption, and complete audit trails come standard.",
  },
  {
    icon: Sparkles,
    title: "Simplicity",
    description:
      "Enterprise features shouldn't require enterprise complexity. Powerful tools that anyone can use from day one.",
  },
  {
    icon: Eye,
    title: "Transparency",
    description:
      "Open pricing, honest communication, no hidden fees. What you see is what you get, always.",
  },
  {
    icon: Heart,
    title: "Customer Obsession",
    description:
      "Your success is our success. Period. Every feature we build starts with your feedback.",
  },
];

const techStack = [
  { icon: Code2, name: "React", detail: "Modern frontend" },
  { icon: Zap, name: "Bun", detail: "Fast runtime" },
  { icon: Database, name: "PostgreSQL", detail: "Reliable database" },
  { icon: Server, name: "Redis", detail: "In-memory cache" },
];

export default function AboutPage() {
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden bg-grid">
        <div className="absolute inset-0 bg-gradient-to-b from-brand-50/60 via-white/0 to-white" />
        <div className="relative mx-auto max-w-7xl px-6 py-24 sm:py-32 lg:px-8 lg:py-40">
          <div className="mx-auto max-w-3xl text-center animate-fade-in-up">
            <p className="text-sm font-semibold uppercase tracking-widest text-brand-600">
              Our Story
            </p>
            <h1 className="mt-4 text-4xl font-extrabold tracking-tight sm:text-5xl lg:text-6xl">
              Built by{" "}
              <span className="text-gradient">HR people</span>, for HR
              people
            </h1>
            <p className="mt-6 text-lg leading-relaxed text-gray-600 sm:text-xl">
              We started with one mission: simplify HR for every company,
              regardless of size. No more choosing between "too basic" and "too
              complicated."
            </p>
          </div>
        </div>
      </section>

      {/* Mission & Vision */}
      <section className="bg-white py-24 sm:py-32">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="grid gap-12 lg:grid-cols-2 lg:gap-16">
            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-8 sm:p-10 animate-fade-in">
              <p className="text-sm font-semibold uppercase tracking-widest text-brand-600">
                Our Mission
              </p>
              <h2 className="mt-4 text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
                Make enterprise-grade HR accessible to every company
              </h2>
              <p className="mt-4 text-base leading-relaxed text-gray-600">
                From startups with 5 employees to enterprises with 5,000, every
                organization deserves HR tools that actually work. We build
                software that scales with you, not against you.
              </p>
            </div>

            <div className="rounded-2xl border border-brand-200 bg-brand-50 p-8 sm:p-10 animate-fade-in">
              <p className="text-sm font-semibold uppercase tracking-widest text-brand-600">
                Our Vision
              </p>
              <h2 className="mt-4 text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
                A world where HR teams spend time on people, not paperwork
              </h2>
              <p className="mt-4 text-base leading-relaxed text-gray-600">
                We envision a future where every HR professional is empowered
                with the tools they need to focus on what truly matters —
                supporting and growing the people in their organization.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Our Story — Timeline */}
      <section className="bg-gray-50 py-24 sm:py-32">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-semibold uppercase tracking-widest text-brand-600">
              How We Got Here
            </p>
            <h2 className="mt-4 text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
              Our Journey
            </h2>
          </div>

          <div className="relative mx-auto mt-16 max-w-2xl">
            {/* Vertical line */}
            <div
              className="absolute left-4 top-0 bottom-0 w-0.5 bg-brand-200 sm:left-1/2 sm:-translate-x-px"
              aria-hidden="true"
            />

            <div className="space-y-12">
              {timeline.map((item, index) => (
                <div
                  key={item.label}
                  className="relative pl-12 sm:pl-0 sm:grid sm:grid-cols-2 sm:gap-8"
                >
                  {/* Dot */}
                  <div
                    className="absolute left-2.5 top-1 h-3 w-3 rounded-full border-2 border-brand-500 bg-white sm:left-1/2 sm:-translate-x-1/2"
                    aria-hidden="true"
                  />

                  {/* Content — alternate sides on larger screens */}
                  {index % 2 === 0 ? (
                    <>
                      <div className="sm:text-right">
                        <h3 className="text-lg font-bold text-gray-900">
                          {item.label}
                        </h3>
                        <p className="mt-2 text-sm leading-relaxed text-gray-600">
                          {item.description}
                        </p>
                      </div>
                      <div className="hidden sm:block" />
                    </>
                  ) : (
                    <>
                      <div className="hidden sm:block" />
                      <div>
                        <h3 className="text-lg font-bold text-gray-900">
                          {item.label}
                        </h3>
                        <p className="mt-2 text-sm leading-relaxed text-gray-600">
                          {item.description}
                        </p>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Values */}
      <section className="bg-white py-24 sm:py-32">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-semibold uppercase tracking-widest text-brand-600">
              What We Stand For
            </p>
            <h2 className="mt-4 text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
              Our Values
            </h2>
          </div>

          <div className="mx-auto mt-16 grid max-w-5xl gap-8 sm:grid-cols-2">
            {values.map((value) => {
              const Icon = value.icon;
              return (
                <div
                  key={value.title}
                  className="group rounded-2xl border border-gray-200 p-8 transition hover:border-brand-200 hover:shadow-lg hover:shadow-brand-500/5"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50 text-brand-600 transition group-hover:bg-gradient-brand group-hover:text-white">
                    <Icon className="h-6 w-6" />
                  </div>
                  <h3 className="mt-6 text-lg font-bold text-gray-900">
                    {value.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-gray-600">
                    {value.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Tech Stack / Open Source */}
      <section className="bg-gradient-dark py-24 sm:py-32">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-semibold uppercase tracking-widest text-brand-300">
              Under the Hood
            </p>
            <h2 className="mt-4 text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Built on modern, proven technology
            </h2>
            <p className="mt-4 text-base leading-relaxed text-gray-400">
              We chose each piece of our stack for reliability, performance, and
              developer experience. No hype-driven decisions — just solid
              engineering.
            </p>
          </div>

          <div className="mx-auto mt-16 grid max-w-3xl grid-cols-2 gap-6 sm:grid-cols-4">
            {techStack.map((tech) => {
              const Icon = tech.icon;
              return (
                <div
                  key={tech.name}
                  className="glass-dark flex flex-col items-center rounded-2xl p-6 text-center"
                >
                  <Icon className="h-8 w-8 text-brand-400" />
                  <p className="mt-3 text-sm font-bold text-white">
                    {tech.name}
                  </p>
                  <p className="mt-1 text-xs text-gray-400">{tech.detail}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-white py-24 sm:py-32">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="mx-auto max-w-3xl rounded-3xl bg-gradient-brand p-10 text-center shadow-2xl shadow-brand-500/25 sm:p-16">
            <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Join the companies modernizing their HR
            </h2>
            <p className="mt-4 text-base leading-relaxed text-brand-100">
              Whether you're a team of 10 or 10,000, Staffora grows with
              you. See what modern HR management looks like.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Link
                to="/pricing"
                className="cursor-pointer inline-flex items-center gap-2 rounded-full bg-gradient-cta px-8 py-3 text-sm font-semibold text-white shadow-lg shadow-accent-500/25 transition hover:-translate-y-0.5 hover:shadow-accent-500/40"
              >
                View Pricing
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                to="/contact"
                className="inline-flex items-center gap-2 rounded-full border border-white/30 px-8 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                Contact Us
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
