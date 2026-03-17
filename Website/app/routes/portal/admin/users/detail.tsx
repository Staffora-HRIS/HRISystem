import { useState, useEffect, useCallback, type FormEvent } from "react";
import { Link, useParams, useNavigate } from "react-router";
import {
  ArrowLeft,
  ChevronRight,
  Save,
  Loader2,
  AlertTriangle,
  RefreshCw,
  CheckCircle,
  KeyRound,
  ToggleLeft,
  ToggleRight,
  Trash2,
  Globe,
  Clock,
  Monitor,
} from "lucide-react";
import { cn } from "~/lib/utils";
import { portalApi } from "~/lib/portal-api";
import { usePortalPermissions } from "~/hooks/use-portal-permissions";

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

interface LoginRecord {
  ip: string;
  timestamp: string;
  userAgent: string;
}

interface UserDetail {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  status: "active" | "disabled";
  createdAt: string;
  lastLoginAt: string | null;
  loginHistory: LoginRecord[];
}

/* -------------------------------------------------------------------------- */
/*  Constants                                                                  */
/* -------------------------------------------------------------------------- */

const ROLE_COLORS: Record<string, string> = {
  super_admin: "bg-purple-100 text-purple-700",
  admin: "bg-brand-100 text-brand-700",
  support_agent: "bg-amber-100 text-amber-700",
  client: "bg-gray-100 text-gray-700",
};

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function formatLabel(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDate(d: string | null): string {
  if (!d) return "--";
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

/* -------------------------------------------------------------------------- */
/*  Component                                                                  */
/* -------------------------------------------------------------------------- */

export function meta() {
  return [{ title: "Edit User - Staffora Client Portal" }];
}

export default function AdminUserDetailPage() {
  const { userId } = useParams();
  const navigate = useNavigate();
  const { isSuperAdmin } = usePortalPermissions();

  const [user, setUser] = useState<UserDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [role, setRole] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const fetchUser = useCallback(async () => {
    if (!userId) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = (await portalApi.admin.users.get(userId)) as { data: UserDetail };
      setUser(res.data);
      setFirstName(res.data.firstName);
      setLastName(res.data.lastName);
      setRole(res.data.role);
    } catch { setError("Failed to load user."); }
    finally { setIsLoading(false); }
  }, [userId]);

  useEffect(() => { fetchUser(); }, [fetchUser]);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    if (!userId || !firstName.trim() || !lastName.trim()) return;
    setIsSaving(true);
    try {
      await portalApi.admin.users.update(userId, { firstName: firstName.trim(), lastName: lastName.trim(), role });
      setToast("User updated successfully");
      setTimeout(() => setToast(null), 3000);
      fetchUser();
    } catch { setError("Failed to update user."); }
    finally { setIsSaving(false); }
  }

  async function handleToggleStatus() {
    if (!user || !userId) return;
    const newStatus = user.status === "active" ? "disabled" : "active";
    if (!window.confirm(`Are you sure you want to ${newStatus === "disabled" ? "disable" : "enable"} this user?`)) return;
    try {
      await portalApi.admin.users.update(userId, { status: newStatus });
      setToast(`User ${newStatus}`);
      setTimeout(() => setToast(null), 3000);
      fetchUser();
    } catch { setError("Failed to update status."); }
  }

  async function handleForcePasswordReset() {
    if (!userId) return;
    if (!window.confirm("This will send a password reset email to the user. Continue?")) return;
    try {
      await portalApi.admin.users.update(userId, { forcePasswordReset: true });
      setToast("Password reset email sent");
      setTimeout(() => setToast(null), 3000);
    } catch { setError("Failed to send password reset."); }
  }

  async function handleDelete() {
    if (!userId || !user) return;
    if (!window.confirm(`Are you sure you want to delete ${user.firstName} ${user.lastName}? This is a soft delete and the account will be deactivated.`)) return;
    try {
      await portalApi.admin.users.update(userId, { deleted: true });
      setToast("User deleted");
      setTimeout(() => navigate("/portal/admin/users"), 1500);
    } catch { setError("Failed to delete user."); }
  }

  if (isLoading) return <div className="space-y-4 animate-pulse"><div className="h-6 w-48 rounded bg-gray-200" /><div className="h-64 rounded-2xl bg-gray-200" /></div>;
  if (error && !user) return <div className="text-center py-16"><AlertTriangle className="mx-auto h-12 w-12 text-red-400" /><p className="mt-4 text-gray-600">{error}</p><button onClick={fetchUser} className="mt-3 rounded-lg bg-brand-600 px-4 py-2 text-sm text-white hover:bg-brand-700"><RefreshCw className="mr-1 inline h-4 w-4" />Retry</button></div>;
  if (!user) return null;

  return (
    <div className="mx-auto max-w-3xl space-y-6 animate-fade-in">
      {toast && <div className="fixed right-4 top-4 z-50 flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-5 py-3 text-sm font-medium text-green-700 shadow-lg animate-fade-in-down"><CheckCircle className="h-5 w-5 text-green-500" />{toast}</div>}

      <nav className="flex items-center gap-1.5 text-sm text-gray-500" aria-label="Breadcrumb">
        <Link to="/portal/admin/users" className="inline-flex items-center gap-1 hover:text-brand-600 transition"><ArrowLeft className="h-3.5 w-3.5" />User Management</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="font-medium text-gray-900">{user.firstName} {user.lastName}</span>
      </nav>

      <div>
        <h1 className="text-2xl font-bold text-gray-900">Edit User</h1>
        <p className="mt-1 text-sm text-gray-500">{user.email}</p>
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700" role="alert">{error}</div>}

      {/* Profile form */}
      <div className="rounded-2xl border border-gray-200 bg-white p-6">
        <form onSubmit={handleSave} className="space-y-5">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div>
              <label htmlFor="fn" className="mb-1.5 block text-sm font-medium text-gray-700">First name</label>
              <input id="fn" type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} className="block w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm shadow-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200" />
            </div>
            <div>
              <label htmlFor="ln" className="mb-1.5 block text-sm font-medium text-gray-700">Last name</label>
              <input id="ln" type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} className="block w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm shadow-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200" />
            </div>
          </div>
          <div>
            <label htmlFor="role-select" className="mb-1.5 block text-sm font-medium text-gray-700">Role</label>
            <select id="role-select" value={role} onChange={(e) => { if (window.confirm("Are you sure you want to change this user's role?")) setRole(e.target.value); }} className="block w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm shadow-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200">
              <option value="client">Client</option>
              <option value="support_agent">Support Agent</option>
              <option value="admin">Admin</option>
              {isSuperAdmin && <option value="super_admin">Super Admin</option>}
            </select>
          </div>
          <div className="flex justify-end">
            <button type="submit" disabled={isSaving} className={cn("inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition", isSaving ? "cursor-not-allowed bg-brand-400" : "bg-brand-600 hover:bg-brand-700")}>
              {isSaving ? <><Loader2 className="h-4 w-4 animate-spin" />Saving...</> : <><Save className="h-4 w-4" />Save Changes</>}
            </button>
          </div>
        </form>
      </div>

      {/* Account actions */}
      <div className="rounded-2xl border border-gray-200 bg-white p-6 space-y-4">
        <h2 className="text-base font-semibold text-gray-900">Account Actions</h2>
        <div className="flex flex-wrap gap-3">
          <button onClick={handleToggleStatus} className={cn("inline-flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition", user.status === "active" ? "border-red-200 text-red-700 hover:bg-red-50" : "border-green-200 text-green-700 hover:bg-green-50")}>
            {user.status === "active" ? <><ToggleLeft className="h-4 w-4" />Disable Account</> : <><ToggleRight className="h-4 w-4" />Enable Account</>}
          </button>
          <button onClick={handleForcePasswordReset} className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50">
            <KeyRound className="h-4 w-4" />Force Password Reset
          </button>
          <button onClick={handleDelete} className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-4 py-2.5 text-sm font-medium text-red-700 transition hover:bg-red-50">
            <Trash2 className="h-4 w-4" />Delete User
          </button>
        </div>
      </div>

      {/* Login history */}
      <div className="rounded-2xl border border-gray-200 bg-white">
        <div className="border-b border-gray-100 px-5 py-4">
          <h2 className="text-base font-semibold text-gray-900">Login History</h2>
        </div>
        {user.loginHistory.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-500">No login records.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/80">
                  <th className="px-5 py-3 text-left font-semibold text-gray-600"><Globe className="mr-1 inline h-3.5 w-3.5" />IP Address</th>
                  <th className="px-5 py-3 text-left font-semibold text-gray-600"><Clock className="mr-1 inline h-3.5 w-3.5" />Time</th>
                  <th className="px-5 py-3 text-left font-semibold text-gray-600"><Monitor className="mr-1 inline h-3.5 w-3.5" />User Agent</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {user.loginHistory.slice(0, 20).map((record, idx) => (
                  <tr key={idx} className="hover:bg-gray-50">
                    <td className="px-5 py-2.5 font-mono text-xs text-gray-700">{record.ip}</td>
                    <td className="px-5 py-2.5 text-gray-500">{formatDate(record.timestamp)}</td>
                    <td className="px-5 py-2.5 text-gray-500 truncate max-w-xs">{record.userAgent}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
