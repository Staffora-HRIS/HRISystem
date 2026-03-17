import { useState, useEffect, useCallback } from "react";
import { Link, useNavigate } from "react-router";
import { Plus, Search, Edit, Trash2, Eye, EyeOff, Pin, PinOff, Newspaper, ChevronLeft, ChevronRight, CheckCircle } from "lucide-react";
import { cn } from "~/lib/utils";
import { portalApi } from "~/lib/portal-api";

interface AdminArticle { id: string; title: string; category: string; status: "draft" | "published"; isPinned: boolean; publishedAt: string | null; viewCount: number }
interface AdminNewsListResponse { data: AdminArticle[]; pagination: { hasMore: boolean; nextCursor: string | null; prevCursor: string | null } }

const CATEGORY_COLORS: Record<string, string> = { announcements: "bg-brand-100 text-brand-700", feature_updates: "bg-green-100 text-green-700", incidents: "bg-red-100 text-red-700", tips: "bg-amber-100 text-amber-700", security: "bg-purple-100 text-purple-700" };
function formatLabel(s: string): string { return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()); }
function formatDate(d: string | null): string { if (!d) return "--"; return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }); }

export function meta() { return [{ title: "News Management - Staffora Client Portal" }]; }

export default function AdminNewsPage() {
  const navigate = useNavigate();
  const [articles, setArticles] = useState<AdminArticle[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState<AdminNewsListResponse["pagination"]>({ hasMore: false, nextCursor: null, prevCursor: null });
  const [search, setSearch] = useState("");
  const [cursor, setCursor] = useState<string | null>(null);
  const [direction, setDirection] = useState<"next" | "prev">("next");
  const [toast, setToast] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const fetchArticles = useCallback(async () => {
    setIsLoading(true); setError(null);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set("search", search.trim());
      if (cursor) { params.set("cursor", cursor); params.set("direction", direction); }
      const res = (await portalApi.news.list(params)) as AdminNewsListResponse;
      setArticles(res.data); setPagination(res.pagination);
    } catch { setError("Failed to load articles."); }
    finally { setIsLoading(false); }
  }, [search, cursor, direction]);

  useEffect(() => { fetchArticles(); }, [fetchArticles]);
  useEffect(() => { setCursor(null); }, [search]);

  async function handleAction(id: string, action: "publish" | "unpublish" | "pin" | "unpin" | "delete") {
    if (action === "delete" && !window.confirm("Delete this article?")) return;
    try {
      if (action === "delete") await portalApi.admin.news.delete(id);
      else await portalApi.admin.news.update(id, action === "publish" ? { status: "published" } : action === "unpublish" ? { status: "draft" } : action === "pin" ? { isPinned: true } : { isPinned: false });
      setToast(`Article ${action === "delete" ? "deleted" : action === "pin" || action === "unpin" ? (action === "pin" ? "pinned" : "unpinned") : (action === "publish" ? "published" : "unpublished")}`);
      setTimeout(() => setToast(null), 3000); fetchArticles();
    } catch { setError(`Failed to ${action} article.`); }
  }

  function toggleSelect(id: string) { setSelected((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; }); }

  async function handleBulk(action: "publish" | "unpublish" | "delete") {
    if (selected.size === 0) return;
    if (action === "delete" && !window.confirm(`Delete ${selected.size} article(s)?`)) return;
    try {
      for (const id of selected) {
        if (action === "delete") await portalApi.admin.news.delete(id);
        else await portalApi.admin.news.update(id, { status: action === "publish" ? "published" : "draft" });
      }
      setToast(`${selected.size} article(s) ${action === "delete" ? "deleted" : action + "ed"}`);
      setTimeout(() => setToast(null), 3000); setSelected(new Set()); fetchArticles();
    } catch { setError("Bulk action failed."); }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {toast && <div className="fixed right-4 top-4 z-50 flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-5 py-3 text-sm font-medium text-green-700 shadow-lg animate-fade-in-down"><CheckCircle className="h-5 w-5 text-green-500" />{toast}</div>}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div><h1 className="text-2xl font-bold text-gray-900">News Management</h1><p className="mt-1 text-sm text-gray-500">Create and manage news articles.</p></div>
        <Link to="/portal/admin/news/new" className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700"><Plus className="h-4 w-4" />New Article</Link>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search articles..." className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-4 text-sm placeholder:text-gray-400 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200" aria-label="Search" />
      </div>

      {selected.size > 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-brand-200 bg-brand-50 p-4">
          <span className="text-sm font-medium text-brand-700">{selected.size} selected</span>
          <button onClick={() => handleBulk("publish")} className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">Publish</button>
          <button onClick={() => handleBulk("unpublish")} className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">Unpublish</button>
          <button onClick={() => handleBulk("delete")} className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50">Delete</button>
        </div>
      )}

      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700" role="alert">{error}<button onClick={fetchArticles} className="ml-2 font-medium underline hover:no-underline">Retry</button></div>}
      {isLoading && <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-14 rounded-xl border border-gray-100 bg-white animate-pulse" />)}</div>}

      {!isLoading && !error && articles.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-gray-200 bg-white py-16 text-center">
          <Newspaper className="h-12 w-12 text-gray-300" /><h3 className="mt-4 text-lg font-semibold text-gray-900">No articles</h3><p className="mt-1.5 text-sm text-gray-500">Create your first article to get started.</p>
        </div>
      )}

      {!isLoading && !error && articles.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead><tr className="border-b border-gray-100 bg-gray-50/80">
                <th className="px-4 py-3"><input type="checkbox" checked={selected.size === articles.length} onChange={() => { if (selected.size === articles.length) setSelected(new Set()); else setSelected(new Set(articles.map((a) => a.id))); }} className="h-4 w-4 rounded border-gray-300 text-brand-600" /></th>
                <th className="px-4 py-3 font-semibold text-gray-600">Title</th><th className="px-4 py-3 font-semibold text-gray-600">Category</th><th className="px-4 py-3 font-semibold text-gray-600">Status</th><th className="px-4 py-3 font-semibold text-gray-600">Pinned</th><th className="px-4 py-3 font-semibold text-gray-600">Published</th><th className="px-4 py-3 font-semibold text-gray-600">Views</th><th className="px-4 py-3 font-semibold text-gray-600">Actions</th>
              </tr></thead>
              <tbody className="divide-y divide-gray-100">
                {articles.map((article) => (
                  <tr key={article.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3"><input type="checkbox" checked={selected.has(article.id)} onChange={() => toggleSelect(article.id)} className="h-4 w-4 rounded border-gray-300 text-brand-600" /></td>
                    <td className="px-4 py-3 font-medium text-gray-900">{article.title}</td>
                    <td className="px-4 py-3"><span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", CATEGORY_COLORS[article.category] || "bg-gray-100 text-gray-700")}>{formatLabel(article.category)}</span></td>
                    <td className="px-4 py-3">{article.status === "published" ? <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">Published</span> : <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-500">Draft</span>}</td>
                    <td className="px-4 py-3">{article.isPinned ? <Pin className="h-4 w-4 text-brand-500" /> : <span className="text-gray-300">--</span>}</td>
                    <td className="px-4 py-3 text-gray-500">{formatDate(article.publishedAt)}</td>
                    <td className="px-4 py-3 text-gray-500">{article.viewCount}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <Link to={`/portal/admin/news/${article.id}`} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition" aria-label="Edit"><Edit className="h-4 w-4" /></Link>
                        <button onClick={() => handleAction(article.id, article.isPinned ? "unpin" : "pin")} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition" aria-label={article.isPinned ? "Unpin" : "Pin"}>{article.isPinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}</button>
                        <button onClick={() => handleAction(article.id, article.status === "published" ? "unpublish" : "publish")} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition" aria-label={article.status === "published" ? "Unpublish" : "Publish"}>{article.status === "published" ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
                        <button onClick={() => handleAction(article.id, "delete")} className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 transition" aria-label="Delete"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!isLoading && articles.length > 0 && (
        <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-5 py-3">
          <button onClick={() => { if (pagination.prevCursor) { setDirection("prev"); setCursor(pagination.prevCursor); } }} disabled={!pagination.prevCursor} className={cn("inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition", pagination.prevCursor ? "text-gray-700 hover:bg-gray-100" : "cursor-not-allowed text-gray-300")}><ChevronLeft className="h-4 w-4" />Previous</button>
          <button onClick={() => { if (pagination.nextCursor) { setDirection("next"); setCursor(pagination.nextCursor); } }} disabled={!pagination.hasMore} className={cn("inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition", pagination.hasMore ? "text-gray-700 hover:bg-gray-100" : "cursor-not-allowed text-gray-300")}>Next<ChevronRight className="h-4 w-4" /></button>
        </div>
      )}
    </div>
  );
}
