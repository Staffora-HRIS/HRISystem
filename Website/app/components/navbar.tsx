import { useState } from "react";
import { Link, useLocation } from "react-router";
import { Menu, X } from "lucide-react";
import { cn } from "~/lib/utils";

const navigation = [
  { name: "Features", href: "/features" },
  { name: "Pricing", href: "/pricing" },
  { name: "About", href: "/about" },
  { name: "Contact", href: "/contact" },
];

export function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  return (
    <header className="fixed top-4 left-4 right-4 z-50">
      <div className="glass rounded-2xl shadow-lg shadow-black/5">
        <nav className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3 lg:px-8">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-brand shadow-lg shadow-brand-500/25">
              <svg viewBox="0 0 24 24" className="h-5 w-5 text-white" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </div>
            <span className="text-xl font-bold tracking-tight">
              Staffora
            </span>
          </Link>

          {/* Desktop nav */}
          <div className="hidden items-center gap-1 lg:flex">
            {navigation.map((item) => (
              <Link
                key={item.name}
                to={item.href}
                className={cn(
                  "rounded-lg px-4 py-2 text-sm font-medium transition",
                  location.pathname === item.href
                    ? "bg-brand-50 text-brand-700"
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                )}
              >
                {item.name}
              </Link>
            ))}
          </div>

          {/* Desktop CTA */}
          <div className="hidden items-center gap-3 lg:flex">
            <a
              href="https://app.staffora.co.uk/login"
              className="cursor-pointer rounded-lg px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 transition"
            >
              Sign In
            </a>
            <Link
              to="/pricing"
              className="cursor-pointer rounded-full bg-gradient-cta px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-accent-500/25 hover:shadow-accent-500/40 transition-all hover:-translate-y-0.5"
            >
              Get Started
            </Link>
          </div>

          {/* Mobile menu button */}
          <button
            className="rounded-lg p-2 text-gray-600 hover:bg-gray-100 lg:hidden"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </nav>
      </div>

      {/* Mobile nav */}
      {mobileOpen && (
        <div className="glass mt-2 rounded-2xl lg:hidden animate-fade-in-down">
          <div className="space-y-1 px-6 py-4">
            {navigation.map((item) => (
              <Link
                key={item.name}
                to={item.href}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  "block rounded-lg px-4 py-3 text-base font-medium transition",
                  location.pathname === item.href
                    ? "bg-brand-50 text-brand-700"
                    : "text-gray-600 hover:bg-gray-50"
                )}
              >
                {item.name}
              </Link>
            ))}
            <div className="border-t border-gray-200 pt-4 mt-4 space-y-2">
              <a
                href="https://app.staffora.co.uk/login"
                className="block rounded-lg px-4 py-3 text-base font-medium text-gray-600 hover:bg-gray-50"
              >
                Sign In
              </a>
              <Link
                to="/pricing"
                onClick={() => setMobileOpen(false)}
                className="block rounded-full bg-gradient-cta px-4 py-3 text-center text-base font-semibold text-white"
              >
                Get Started
              </Link>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
