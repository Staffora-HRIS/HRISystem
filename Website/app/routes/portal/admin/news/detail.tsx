import { useState, useEffect, useCallback, type FormEvent } from "react";
import { Link, useParams, useNavigate } from "react-router";
import { ArrowLeft, ChevronRight, Save, Loader2, AlertTriangle, RefreshCw, CheckCircle, Trash2, Eye, EyeOff, Pin, BarChart3 } from "lucide-react";
import { cn } from "~/lib/utils";
import { portalApi } from "~/lib/portal-api";

interface AdminArticleDetail { id: string; title: string; slug: string; category: string; severity: string; summary: string; content: string; tags: string[]; isPinned: boolean; visibility: string; status: string; publishedAt: string | null; viewCount: number; readCount: number }

const CATEGORIES = [
  { value: "announcements", label: "Announcements" }, { value: "feature_updates", label: "Feature Updates" },
  { value: "incidents", label: "Incidents" }, { value: "tips", label: "Tips" }, { value: "security", label: "Security" },
];
const SEVERITIES = [{ value: "", label: "None" }, { value: "info", label: "Info" }, { value: "warning", label: "Warning" }, { value: "critical", label: "Critical" }];

function slugify(text: string): string { return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }

export function meta() { return [{ title: "Edit Article - Admin - Staffora Client Portal" }]; }

export default function AdminNewsDetailPage() {
  const { newsId } = useParams();
  const navigate = useNavigate();

  const [article, setArticle] = useState<AdminArticleDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [category, setCategory] = useState("announcements");
  const [severity, setSeverity] = useState("");
  const [summary, setSummary] = useState("");
  const [content, setContent] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [isPinned, setIsPinned] = useState(false);
  const [visibility, setVisibility] = useState("all");
  const [isSaving, setIsSaving] = useState(false);

  const fetchArticle = useCallback(async () => {
    if (!newsId) return;
    setIsLoading(true); setError(null);
    try {
      const res = (await portalApi.news.get(newsId)) as { data: AdminArticleDetail };
      const a = res.data; setArticle(a);
      setTitle(a.title); setSlug(a.slug); setCategory(a.category); setSeverity(a.severity || "");
      setSummary(a.summary); setContent(a.content); setTagsInput(a.tags.join(", ")); setIsPinned(a.isPinned); setVisibility(a.visibility);
    } catch { setError("Failed to load article."); }
    finally { setIsLoading(false); }
  }, [newsId]);

  useEffect(() => { fetchArticle(); }, [fetchArticle]);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    if (!newsId || !title.trim() || !summary.trim() || !content.trim()) return;
    setIsSaving(true);
    try {
      const tags = tagsInput.split(",").map((t) => t.trim()).filter(Boolean);
      await portalApi.admin.news.update(newsId, { title: title.trim(), slug, category, severity: severity || undefined, summary: summary.trim(), content: content.trim(), tags, isPinned, visibility });
      setToast("Article updated"); setTimeout(() => setToast(null), 3000); fetchArticle();
    } catch { setError("Failed to save."); }
    finally { setIsSaving(false); }
  }

  async function handleTogglePublish() {
    if (!newsId || !article) return;
    try {
      await portalApi.admin.news.update(newsId, { status: article.status === "published" ? "draft" : "published" });
      setToast(article.status === "published" ? "Unpublished" : "Published"); setTimeout(() => setToast(null), 3000); fetchArticle();
    } catch { setError("Failed to update."); }
  }

  async function handleDelete() {
    if (!newsId || !window.confirm("Are you sure you want to delete this article?")) return;
    try { await portalApi.admin.news.delete(newsId); setToast("Deleted"); setTimeout(() => navigate("/portal/admin/news"), 1500); }
    catch { setError("Failed to delete."); }
  }

  if (isLoading) return <div className="space-y-4 animate-pulse"><div className="h-6 w-48 rounded bg-gray-200" /><div className="h-64 rounded-2xl bg-gray-200" /></div>;
  if (error && !article) return <div className="text-center py-16"><AlertTriangle className="mx-auto h-12 w-12 text-red-400" /><p className="mt-4 text-gray-600">{error}</p><button onClick={fetchArticle} className="mt-3 rounded-lg bg-brand-600 px-4 py-2 text-sm text-white hover:bg-brand-700"><RefreshCw className="mr-1 inline h-4 w-4" />Retry</button></div>;
  if (!article) return null;

  const showSeverity = category === "incidents" || category === "security";

  return (
    <div className="mx-auto max-w-3xl space-y-6 animate-fade-in">
      {toast && <div className="fixed right-4 top-4 z-50 flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-5 py-3 text-sm font-medium text-green-700 shadow-lg animate-fade-in-down"><CheckCircle className="h-5 w-5 text-green-500" />{toast}</div>}

      <nav className="flex items-center gap-1.5 text-sm text-gray-500" aria-label="Breadcrumb">
        <Link to="/portal/admin/news" className="inline-flex items-center gap-1 hover:text-brand-600 transition"><ArrowLeft className="h-3.5 w-3.5" />News Management</Link>
        <ChevronRight className="h-3.5 w-3.5" /><span className="font-medium text-gray-900 truncate max-w-xs">{article.title}</span>
      </nav>

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Edit Article</h1>
        <div className="flex items-center gap-4 text-sm text-gray-500">
          <span className="flex items-center gap-1"><BarChart3 className="h-4 w-4" />{article.viewCount} views</span>
          <span>{article.readCount} reads</span>
        </div>
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700" role="alert">{error}</div>}

      <form onSubmit={handleSave} className="rounded-2xl border border-gray-200 bg-white p-6 space-y-6">
        <div><label htmlFor="t" className="mb-1.5 block text-sm font-medium text-gray-700">Title <span className="text-red-500">*</span></label><input id="t" type="text" value={title} onChange={(e) => setTitle(e.target.value)} className="block w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm shadow-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200" /></div>
        <div><label htmlFor="s" className="mb-1.5 block text-sm font-medium text-gray-700">Slug</label><input id="s" type="text" value={slug} onChange={(e) => setSlug(e.target.value)} className="block w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm shadow-sm font-mono text-xs focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200" /></div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div><label htmlFor="cat" className="mb-1.5 block text-sm font-medium text-gray-700">Category</label><select id="cat" value={category} onChange={(e) => setCategory(e.target.value)} className="block w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm shadow-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200">{CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</select></div>
          {showSeverity && <div><label htmlFor="sev" className="mb-1.5 block text-sm font-medium text-gray-700">Severity</label><select id="sev" value={severity} onChange={(e) => setSeverity(e.target.value)} className="block w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm shadow-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200">{SEVERITIES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</select></div>}
        </div>

        <div><label htmlFor="sum" className="mb-1.5 block text-sm font-medium text-gray-700">Summary <span className="text-red-500">*</span></label><textarea id="sum" value={summary} onChange={(e) => setSummary(e.target.value)} rows={2} maxLength={300} className="block w-full resize-y rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm shadow-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200" /><p className="mt-1 text-xs text-gray-400 text-right">{summary.length}/300</p></div>
        <div><label htmlFor="cnt" className="mb-1.5 block text-sm font-medium text-gray-700">Content <span className="text-red-500">*</span></label><textarea id="cnt" value={content} onChange={(e) => setContent(e.target.value)} rows={12} className="block w-full resize-y rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm shadow-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200" /></div>
        <div><label htmlFor="tags" className="mb-1.5 block text-sm font-medium text-gray-700">Tags</label><input id="tags" type="text" value={tagsInput} onChange={(e) => setTagsInput(e.target.value)} className="block w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm shadow-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200" placeholder="tag1, tag2" /></div>

        <label className="flex items-center gap-3 cursor-pointer"><input type="checkbox" checked={isPinned} onChange={(e) => setIsPinned(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-brand-600" /><span className="text-sm text-gray-700 flex items-center gap-1"><Pin className="h-3.5 w-3.5" />Pin to top</span></label>

        <div className="flex justify-end"><button type="submit" disabled={isSaving} className={cn("inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition", isSaving ? "cursor-not-allowed bg-brand-400" : "bg-brand-600 hover:bg-brand-700")}>{isSaving ? <><Loader2 className="h-4 w-4 animate-spin" />Saving...</> : <><Save className="h-4 w-4" />Save Changes</>}</button></div>
      </form>

      <div className="flex flex-wrap gap-3">
        <button onClick={handleTogglePublish} className={cn("inline-flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition", article.status === "published" ? "border-gray-200 text-gray-700 hover:bg-gray-50" : "border-green-200 text-green-700 hover:bg-green-50")}>{article.status === "published" ? <><EyeOff className="h-4 w-4" />Unpublish</> : <><Eye className="h-4 w-4" />Publish</>}</button>
        <button onClick={handleDelete} className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-4 py-2.5 text-sm font-medium text-red-700 transition hover:bg-red-50"><Trash2 className="h-4 w-4" />Delete</button>
      </div>
    </div>
  );
}
