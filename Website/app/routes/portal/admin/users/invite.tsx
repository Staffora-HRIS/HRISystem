import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { ArrowLeft, ChevronRight, UserPlus, Loader2, CheckCircle, AlertCircle } from "lucide-react";
import { cn } from "~/lib/utils";
import { portalApi } from "~/lib/portal-api";
import { usePortalPermissions } from "~/hooks/use-portal-permissions";

export function meta() {
  return [{ title: "Invite User - Staffora Client Portal" }];
}

export default function InviteUserPage() {
  const navigate = useNavigate();
  const { isSuperAdmin } = usePortalPermissions();

  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [role, setRole] = useState("client");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [touched, setTouched] = useState({ email: false, firstName: false, lastName: false });

  const emailError = touched.email && !email.trim() ? "Email is required" : touched.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? "Enter a valid email" : null;
  const firstNameError = touched.firstName && !firstName.trim() ? "First name is required" : null;
  const lastNameError = touched.lastName && !lastName.trim() ? "Last name is required" : null;
  const canSubmit = email.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && firstName.trim() && lastName.trim();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setTouched({ email: true, firstName: true, lastName: true });
    if (!canSubmit) return;

    setIsSubmitting(true);
    setError(null);
    try {
      await portalApi.admin.users.create({
        email: email.trim(),
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        role,
      });
      setToast("Invitation sent successfully!");
      setTimeout(() => navigate("/portal/admin/users"), 1500);
    } catch {
      setError("Failed to send invitation. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 animate-fade-in">
      {toast && <div className="fixed right-4 top-4 z-50 flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-5 py-3 text-sm font-medium text-green-700 shadow-lg animate-fade-in-down"><CheckCircle className="h-5 w-5 text-green-500" />{toast}</div>}

      <nav className="flex items-center gap-1.5 text-sm text-gray-500" aria-label="Breadcrumb">
        <Link to="/portal/admin/users" className="inline-flex items-center gap-1 hover:text-brand-600 transition"><ArrowLeft className="h-3.5 w-3.5" />User Management</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="font-medium text-gray-900">Invite</span>
      </nav>

      <div>
        <h1 className="text-2xl font-bold text-gray-900">Invite New User</h1>
        <p className="mt-1 text-sm text-gray-500">Send an invitation to a new portal user.</p>
      </div>

      {error && <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4" role="alert"><AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-500" /><p className="text-sm text-red-700">{error}</p></div>}

      <div className="rounded-2xl border border-gray-200 bg-white p-6">
        <form onSubmit={handleSubmit} noValidate className="space-y-5">
          <div>
            <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-gray-700">Email address <span className="text-red-500">*</span></label>
            <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} onBlur={() => setTouched((p) => ({ ...p, email: true }))} placeholder="jane.smith@company.com"
              className={cn("block w-full rounded-xl border bg-white px-4 py-3 text-sm shadow-sm transition placeholder:text-gray-400 focus:outline-none focus:ring-2", emailError ? "border-red-300 focus:border-red-400 focus:ring-red-200" : "border-gray-200 focus:border-brand-400 focus:ring-brand-200")}
              aria-invalid={emailError ? "true" : undefined} aria-describedby={emailError ? "email-err" : undefined} />
            {emailError && <p id="email-err" className="mt-1.5 text-xs text-red-600">{emailError}</p>}
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div>
              <label htmlFor="firstName" className="mb-1.5 block text-sm font-medium text-gray-700">First name <span className="text-red-500">*</span></label>
              <input id="firstName" type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} onBlur={() => setTouched((p) => ({ ...p, firstName: true }))} placeholder="Jane"
                className={cn("block w-full rounded-xl border bg-white px-4 py-3 text-sm shadow-sm transition placeholder:text-gray-400 focus:outline-none focus:ring-2", firstNameError ? "border-red-300 focus:border-red-400 focus:ring-red-200" : "border-gray-200 focus:border-brand-400 focus:ring-brand-200")} />
              {firstNameError && <p className="mt-1.5 text-xs text-red-600">{firstNameError}</p>}
            </div>
            <div>
              <label htmlFor="lastName" className="mb-1.5 block text-sm font-medium text-gray-700">Last name <span className="text-red-500">*</span></label>
              <input id="lastName" type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} onBlur={() => setTouched((p) => ({ ...p, lastName: true }))} placeholder="Smith"
                className={cn("block w-full rounded-xl border bg-white px-4 py-3 text-sm shadow-sm transition placeholder:text-gray-400 focus:outline-none focus:ring-2", lastNameError ? "border-red-300 focus:border-red-400 focus:ring-red-200" : "border-gray-200 focus:border-brand-400 focus:ring-brand-200")} />
              {lastNameError && <p className="mt-1.5 text-xs text-red-600">{lastNameError}</p>}
            </div>
          </div>

          <div>
            <label htmlFor="role" className="mb-1.5 block text-sm font-medium text-gray-700">Role <span className="text-red-500">*</span></label>
            <select id="role" value={role} onChange={(e) => setRole(e.target.value)} className="block w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm shadow-sm transition focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200">
              <option value="client">Client</option>
              <option value="support_agent">Support Agent</option>
              <option value="admin">Admin</option>
              {isSuperAdmin && <option value="super_admin">Super Admin</option>}
            </select>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Link to="/portal/admin/users" className="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50">Cancel</Link>
            <button type="submit" disabled={isSubmitting} className={cn("inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition", isSubmitting ? "cursor-not-allowed bg-brand-400" : "bg-brand-600 hover:bg-brand-700")}>
              {isSubmitting ? <><Loader2 className="h-4 w-4 animate-spin" />Sending...</> : <><UserPlus className="h-4 w-4" />Send Invitation</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
