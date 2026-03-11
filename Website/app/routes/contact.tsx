import { useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router";
import {
  Calendar,
  LifeBuoy,
  Handshake,
  Mail,
  Clock,
  HeadphonesIcon,
  Send,
  CheckCircle2,
} from "lucide-react";

const contactOptions = [
  {
    icon: Calendar,
    title: "Sales",
    heading: "Book a demo",
    description:
      "Talk to our team about your HR needs. We'll walk you through the platform and answer every question.",
  },
  {
    icon: LifeBuoy,
    title: "Support",
    heading: "Need help?",
    description:
      "Our support team is ready to assist with setup, troubleshooting, or anything else you need.",
  },
  {
    icon: Handshake,
    title: "Partnerships",
    heading: "Let's work together",
    description:
      "Integration and partnership inquiries welcome. Let's build something great together.",
  },
];

const companySizes = ["1-10", "11-25", "26-50", "51-100", "100+"] as const;

const subjects = [
  "Book a Demo",
  "General Inquiry",
  "Support",
  "Partnership",
] as const;

interface FormData {
  firstName: string;
  lastName: string;
  email: string;
  company: string;
  companySize: string;
  subject: string;
  message: string;
}

const initialFormData: FormData = {
  firstName: "",
  lastName: "",
  email: "",
  company: "",
  companySize: "",
  subject: "",
  message: "",
};

export default function ContactPage() {
  const [formData, setFormData] = useState<FormData>(initialFormData);
  const [submitted, setSubmitted] = useState(false);

  function handleChange(
    e: React.ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >
  ) {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitted(true);
  }

  function handleReset() {
    setFormData(initialFormData);
    setSubmitted(false);
  }

  const inputClasses =
    "block w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 placeholder-gray-400 shadow-sm transition focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20";
  const labelClasses = "block text-sm font-medium text-gray-700 mb-1.5";
  const selectClasses =
    "block w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 shadow-sm transition focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 appearance-none";

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden bg-grid">
        <div className="absolute inset-0 bg-gradient-to-b from-brand-50/60 via-white/0 to-white" />
        <div className="relative mx-auto max-w-7xl px-6 py-24 sm:py-32 lg:px-8">
          <div className="mx-auto max-w-3xl text-center animate-fade-in-up">
            <p className="text-sm font-semibold uppercase tracking-widest text-brand-600">
              Contact Us
            </p>
            <h1 className="mt-4 text-4xl font-extrabold tracking-tight sm:text-5xl lg:text-6xl">
              Get in <span className="text-gradient">touch</span>
            </h1>
            <p className="mt-6 text-lg leading-relaxed text-gray-600 sm:text-xl">
              Whether you want a demo, have questions, or need support — we're
              here to help you succeed.
            </p>
          </div>
        </div>
      </section>

      {/* Contact Options */}
      <section className="bg-white py-24 sm:py-32">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {contactOptions.map((option) => {
              const Icon = option.icon;
              return (
                <div
                  key={option.title}
                  className="group rounded-2xl border border-gray-200 p-8 text-center transition hover:border-brand-200 hover:shadow-lg hover:shadow-brand-500/5"
                >
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 transition group-hover:bg-gradient-brand group-hover:text-white">
                    <Icon className="h-7 w-7" />
                  </div>
                  <p className="mt-4 text-xs font-semibold uppercase tracking-widest text-brand-600">
                    {option.title}
                  </p>
                  <h3 className="mt-2 text-xl font-bold text-gray-900">
                    {option.heading}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-gray-600">
                    {option.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Contact Form + Info */}
      <section className="bg-gray-50 py-24 sm:py-32">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="grid gap-12 lg:grid-cols-3 lg:gap-16">
            {/* Form */}
            <div className="lg:col-span-2">
              <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm sm:p-10">
                {submitted ? (
                  <div className="flex flex-col items-center py-12 text-center animate-fade-in">
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-50">
                      <CheckCircle2 className="h-8 w-8 text-green-600" />
                    </div>
                    <h3 className="mt-6 text-2xl font-bold text-gray-900">
                      Message sent!
                    </h3>
                    <p className="mt-2 text-base text-gray-600">
                      Thanks for reaching out, {formData.firstName}. We'll get
                      back to you within 24 hours.
                    </p>
                    <button
                      type="button"
                      onClick={handleReset}
                      className="mt-8 rounded-full bg-gradient-brand px-8 py-3 text-sm font-semibold text-white shadow-lg shadow-brand-500/25 transition hover:-translate-y-0.5 hover:shadow-brand-500/40"
                    >
                      Send another message
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="mb-8">
                      <h2 className="text-2xl font-bold tracking-tight text-gray-900">
                        Send us a message
                      </h2>
                      <p className="mt-1 text-sm text-gray-500">
                        Fill out the form below and we'll be in touch shortly.
                      </p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-6">
                      {/* First Name + Last Name */}
                      <div className="grid gap-6 sm:grid-cols-2">
                        <div>
                          <label htmlFor="firstName" className={labelClasses}>
                            First Name <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="text"
                            id="firstName"
                            name="firstName"
                            required
                            value={formData.firstName}
                            onChange={handleChange}
                            placeholder="Jane"
                            className={inputClasses}
                          />
                        </div>
                        <div>
                          <label htmlFor="lastName" className={labelClasses}>
                            Last Name <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="text"
                            id="lastName"
                            name="lastName"
                            required
                            value={formData.lastName}
                            onChange={handleChange}
                            placeholder="Smith"
                            className={inputClasses}
                          />
                        </div>
                      </div>

                      {/* Work Email */}
                      <div>
                        <label htmlFor="email" className={labelClasses}>
                          Work Email <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="email"
                          id="email"
                          name="email"
                          required
                          value={formData.email}
                          onChange={handleChange}
                          placeholder="jane@company.com"
                          className={inputClasses}
                        />
                      </div>

                      {/* Company Name */}
                      <div>
                        <label htmlFor="company" className={labelClasses}>
                          Company Name <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          id="company"
                          name="company"
                          required
                          value={formData.company}
                          onChange={handleChange}
                          placeholder="Acme Inc."
                          className={inputClasses}
                        />
                      </div>

                      {/* Company Size + Subject */}
                      <div className="grid gap-6 sm:grid-cols-2">
                        <div>
                          <label
                            htmlFor="companySize"
                            className={labelClasses}
                          >
                            Company Size{" "}
                            <span className="text-red-500">*</span>
                          </label>
                          <select
                            id="companySize"
                            name="companySize"
                            required
                            value={formData.companySize}
                            onChange={handleChange}
                            className={selectClasses}
                          >
                            <option value="" disabled>
                              Select size
                            </option>
                            {companySizes.map((size) => (
                              <option key={size} value={size}>
                                {size} employees
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label htmlFor="subject" className={labelClasses}>
                            Subject <span className="text-red-500">*</span>
                          </label>
                          <select
                            id="subject"
                            name="subject"
                            required
                            value={formData.subject}
                            onChange={handleChange}
                            className={selectClasses}
                          >
                            <option value="" disabled>
                              Select subject
                            </option>
                            {subjects.map((subj) => (
                              <option key={subj} value={subj}>
                                {subj}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* Message */}
                      <div>
                        <label htmlFor="message" className={labelClasses}>
                          Message <span className="text-red-500">*</span>
                        </label>
                        <textarea
                          id="message"
                          name="message"
                          required
                          rows={5}
                          value={formData.message}
                          onChange={handleChange}
                          placeholder="Tell us about your HR needs..."
                          className={inputClasses + " resize-none"}
                        />
                      </div>

                      {/* Submit */}
                      <button
                        type="submit"
                        className="cursor-pointer inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-cta px-8 py-3.5 text-sm font-semibold text-white shadow-lg shadow-accent-500/25 transition hover:-translate-y-0.5 hover:shadow-accent-500/40 sm:w-auto"
                      >
                        <Send className="h-4 w-4" />
                        Send Message
                      </button>
                    </form>
                  </>
                )}
              </div>
            </div>

            {/* Side Info */}
            <div className="space-y-8">
              <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
                <h3 className="text-lg font-bold text-gray-900">
                  Other ways to reach us
                </h3>

                <div className="mt-6 space-y-6">
                  <div className="flex gap-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                      <Mail className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900">
                        Email
                      </p>
                      <a
                        href="mailto:hello@staffora.co.uk"
                        className="text-sm text-brand-600 hover:text-brand-700 transition"
                      >
                        hello@staffora.co.uk
                      </a>
                    </div>
                  </div>

                  <div className="flex gap-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                      <Clock className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900">
                        Response Time
                      </p>
                      <p className="text-sm text-gray-600">
                        We typically respond within 24 hours
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                      <HeadphonesIcon className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900">
                        Support Hours
                      </p>
                      <p className="text-sm text-gray-600">
                        Monday &ndash; Friday, 9am &ndash; 6pm EST
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-brand-200 bg-brand-50 p-8">
                <h3 className="text-lg font-bold text-gray-900">
                  Looking for docs?
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-gray-600">
                  Check out our help center and API documentation for technical
                  resources and guides.
                </p>
                <Link
                  to="/features"
                  className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-brand-600 hover:text-brand-700 transition"
                >
                  Explore features
                  <span aria-hidden="true">&rarr;</span>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
