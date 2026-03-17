import { useState, useEffect, useCallback } from "react";
import { Link, useNavigate } from "react-router";
import {
  Plus,
  Search,
  Users,
  ChevronLeft,
  ChevronRight,
  ToggleLeft,
  ToggleRight,
  KeyRound,
  Edit,
} from "lucide-react";
import { cn } from "~/lib/utils";
import { portalApi } from "~/lib/portal-api";

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

interface PortalUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  status: "active" | "disabled";
  lastLoginAt: string | null;
  createdAt: string;
}

interface UserListResponse {
  data: PortalUser[];
  pagination: { hasMore: boolean; nextCursor: string | null; prevCursor: string | null };
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
  if (!d) return "Never";
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/* -------------------------------------------------------------------------- */
/*  Component                                                                  */
/* -------------------------------------------------------------------------- */

export function meta() {
  return [{ title: "User Management - Staffora Client Portal" }];
}

export default function AdminUsersPage() {
  const navigate = useNavigate();
  const [users, setUsers] = useState<PortalUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState<UserListResponse["pagination"]>({ hasMore: false, nextCursor: null, prevCursor: null });

  const [role, setRole] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [cursor, setCursor] = useState<string | null>(null);
  const [direction, setDirection] = useState<"next" | "prev">("next");
  const [toast, setToast] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (role) params.set("role", role);
      if (statusFilter) params.set("status", statusFilter);
      if (search.trim()) params.set("search", search.trim());
      if (cursor) { params.set("cursor", cursor); params.set("direction", direction); }
      const res = (await portalApi.admin.users.list(params)) as UserListResponse;
      setUsers(res.data);
      setPagination(res.pagination);
    } catch { setError("Failed to load users."); }
    finally { setIsLoading(false); }
  }, [role, statusFilter, search, cursor, direction]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);
  useEffect(() => { setCursor(null); }, [role, statusFilter, search]);

  async function handleToggleStatus(user: PortalUser) {
    const newStatus = user.status === "active" ? "disabled" : "active";
    if (!window.confirm(`Are you sure you want to ${newStatus === "disabled" ? "disable" : "enable"} ${user.firstName} ${user.lastName}?`)) return;
    try {
      await portalApi.admin.users.update(user.id, { status: newStatus });
      setToast(`User ${newStatus === "active" ? "enabled" : "disabled"} successfully`);
      setTimeout(() => setToast(null), 3000);
      fetchUsers();
    } catch { setError("Failed to update user status."); }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {toast && <div className="fixed right-4 top-4 z-50 rounded-xl border border-green-200 bg-green-50 px-5 py-3 text-sm font-medium text-green-700 shadow-lg animate-fade-in-down">{toast}</div>}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">User Management</h1>
          <p className="mt-1 text-sm text-gray-500">Manage portal users and their roles.</p>
        </div>
        <Link to="/portal/admin/users/invite" className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700">
          <Plus className="h-4 w-4" />Invite User
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4 sm:flex-row sm:items-center">
        <select value={role} onChange={(e) => setRole(e.target.value)} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm" aria-label="Filter by role">
          <option value="">All Roles</option>
          <option value="client">Client</option>
          <option value="support_agent">Support Agent</option>
          <option value="admin">Admin</option>
          <option value="super_admin">Super Admin</option>
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm" aria-label="Filter by status">
          <option value="">All Statuses</option>
          <option value="active">Active</option>
          <option value="disabled">Disabled</option>
        </select>
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name or email..." className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-4 text-sm placeholder:text-gray-400 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200" aria-label="Search users" />
        </div>
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700" role="alert">{error}<button onClick={fetchUsers} className="ml-2 font-medium underline hover:no-underline">Retry</button></div>}

      {isLoading && <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-14 rounded-xl border border-gray-100 bg-white animate-pulse" />)}</div>}

      {!isLoading && !error && users.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-gray-200 bg-white py-16 text-center">
          <Users className="h-12 w-12 text-gray-300" />
          <h3 className="mt-4 text-lg font-semibold text-gray-900">No users found</h3>
          <p className="mt-1.5 text-sm text-gray-500">Try adjusting your filters or invite a new user.</p>
        </div>
      )}

      {!isLoading && !error && users.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/80">
                  <th className="px-5 py-3.5 font-semibold text-gray-600">Name</th>
                  <th className="px-5 py-3.5 font-semibold text-gray-600">Email</th>
                  <th className="px-5 py-3.5 font-semibold text-gray-600">Role</th>
                  <th className="px-5 py-3.5 font-semibold text-gray-600">Status</th>
                  <th className="px-5 py-3.5 font-semibold text-gray-600">Last Login</th>
                  <th className="px-5 py-3.5 font-semibold text-gray-600">Created</th>
                  <th className="px-5 py-3.5 font-semibold text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {users.map((user) => (
                  <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3.5 font-medium text-gray-900">{user.firstName} {user.lastName}</td>
                    <td className="px-5 py-3.5 text-gray-500">{user.email}</td>
                    <td className="px-5 py-3.5"><span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", ROLE_COLORS[user.role] || "bg-gray-100 text-gray-700")}>{formatLabel(user.role)}</span></td>
                    <td className="px-5 py-3.5"><span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", user.status === "active" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700")}>{formatLabel(user.status)}</span></td>
                    <td className="px-5 py-3.5 text-gray-500">{formatDate(user.lastLoginAt)}</td>
                    <td className="px-5 py-3.5 text-gray-500">{formatDate(user.createdAt)}</td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        <Link to={`/portal/admin/users/${user.id}`} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition" aria-label="Edit user"><Edit className="h-4 w-4" /></Link>
                        <button onClick={() => handleToggleStatus(user)} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition" aria-label={user.status === "active" ? "Disable user" : "Enable user"}>
                          {user.status === "active" ? <ToggleRight className="h-4 w-4 text-green-500" /> : <ToggleLeft className="h-4 w-4 text-gray-400" />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!isLoading && users.length > 0 && (
        <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-5 py-3">
          <button onClick={() => { if (pagination.prevCursor) { setDirection("prev"); setCursor(pagination.prevCursor); } }} disabled={!pagination.prevCursor} className={cn("inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition", pagination.prevCursor ? "text-gray-700 hover:bg-gray-100" : "cursor-not-allowed text-gray-300")}><ChevronLeft className="h-4 w-4" />Previous</button>
          <button onClick={() => { if (pagination.nextCursor) { setDirection("next"); setCursor(pagination.nextCursor); } }} disabled={!pagination.hasMore} className={cn("inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition", pagination.hasMore ? "text-gray-700 hover:bg-gray-100" : "cursor-not-allowed text-gray-300")}>Next<ChevronRight className="h-4 w-4" /></button>
        </div>
      )}
    </div>
  );
}
