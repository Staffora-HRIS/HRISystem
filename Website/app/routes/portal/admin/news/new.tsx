import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { ArrowLeft, ChevronRight, Loader2, CheckCircle, AlertCircle, X, Pin } from "lucide-react";
import { cn } from "~/lib/utils";
import { portalApi } from "~/lib/portal-api";

const CATEGORIES = [
  { value: "announcements", label: "Announcements" }, { value: "feature_updates", label: "Feature Updates" },
  { value: "incidents", label: "Incidents" }, { value: "tips", label: "Tips" }, { value: "security", label: "Security" },
];

const SEVERITIES = [
  { value: "", label: "None" }, { value: "info", label: "Info" },
  { value: "warning", label: "Warning" }, { value: "critical", label: "Critical" },
];

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function meta() { return [{ title: "New Article - Staffora Client Portal" }]; }

export default function NewArticlePage() {
  const navigate = useNavigate();

  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [autoSlug, setAutoSlug] = useState(true);
  const [category, setCategory] = useState("announcements");
  const [severity, setSeverity] = useState("");
  const [summary, setSummary] = useState("");
  const [content, setContent] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [isPinned, setIsPinned] = useState(false);
  const [visibility, setVisibility] = useState("all");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [touched, setTouched] = useState({ title: false, summary: false, content: false });

  const titleError = touched.title && !title.trim() ? "Title is required" : null;
  const summaryError = touched.summary && !summary.trim() ? "Summary is required" : touched.summary && summary.length > 300 ? "Summary must be 300 characters or fewer" : null;
  const contentError = touched.content && !content.trim() ? "Content is required" : null;
  const canSubmit = title.trim() && summary.trim() && summary.length <= 300 && content.trim();

  const tags = tagsInput.split(",").map((t) => t.trim()).filter(Boolean);

  function handleTitleChange(val: string) {
    setTitle(val);
    if (autoSlug) setSlug(slugify(val));
  }

  async function submitForm(publish: boolean) {
    setTouched({ title: true, summary: true, content: true });
    if (!canSubmit) return;

    setIsSubmitting(true); setError(null);
    try {
      await portalApi.admin.news.create({
        title: title.trim(), slug: slug || slugify(title), category, severity: severity || undefined,
        summary: summary.trim(), content: content.trim(), tags, isPinned, visibility,
        status: publish ? "published" : "draft",
      });
      setToast(publish ? "Article published!" : "Article saved as draft!");
      setTimeout(() => navigate("/portal/admin/news"), 1500);
    } catch { setError("Failed to create article."); }
    finally { setIsSubmitting(false); }
  }

  const showSeverity = category === "incidents" || category === "security";

  return (
    <div className="mx-auto max-w-3xl space-y-6 animate-fade-in">
      {toast && <div className="fixed right-4 top-4 z-50 flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-5 py-3 text-sm font-medium text-green-700 shadow-lg animate-fade-in-down"><CheckCircle className="h-5 w-5 text-green-500" />{toast}</div>}

      <nav className="flex items-center gap-1.5 text-sm text-gray-500" aria-label="Breadcrumb">
        <Link to="/portal/admin/news" className="inline-flex items-center gap-1 hover:text-brand-600 transition"><ArrowLeft className="h-3.5 w-3.5" />News Management</Link>
        <ChevronRight className="h-3.5 w-3.5" /><span className="font-medium text-gray-900">New Article</span>
      </nav>

      <div><h1 className="text-2xl font-bold text-gray-900">Create Article</h1><p className="mt-1 text-sm text-gray-500">Create a new news article or announcement.</p></div>

      {error && <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4" role="alert"><AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-500" /><p className="text-sm text-red-700">{error}</p></div>}

      <form onSubmit={(e) => { e.preventDefault(); submitForm(true); }} noValidate>
        <div className="rounded-2xl border border-gray-200 bg-white p-6 space-y-6">
          {/* Title */}
          <div>
            <label htmlFor="title" className="mb-1.5 block text-sm font-medium text-gray-700">Title <span className="text-red-500">*</span></label>
            <input id="title" type="text" value={title} onChange={(e) => handleTitleChange(e.target.value)} onBlur={() => setTouched((p) => ({ ...p, title: true }))}
              className={cn("block w-full rounded-xl border bg-white px-4 py-3 text-sm shadow-sm focus:outline-none focus:ring-2", titleError ? "border-red-300 focus:ring-red-200" : "border-gray-200 focus:border-brand-400 focus:ring-brand-200")} placeholder="Article title" />
            {titleError && <p className="mt-1.5 text-xs text-red-600">{titleError}</p>}
          </div>

          {/* Slug */}
          <div>
            <label htmlFor="slug" className="mb-1.5 block text-sm font-medium text-gray-700">Slug</label>
            <input id="slug" type="text" value={slug} onChange={(e) => { setSlug(e.target.value); setAutoSlug(false); }} className="block w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm shadow-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200 font-mono text-xs" placeholder="auto-generated-from-title" />
          </div>

          {/* Category + Severity */}
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div>
              <label htmlFor="cat" className="mb-1.5 block text-sm font-medium text-gray-700">Category</label>
              <select id="cat" value={category} onChange={(e) => setCategory(e.target.value)} className="block w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm shadow-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200">
                {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            {showSeverity && (
              <div>
                <label htmlFor="sev" className="mb-1.5 block text-sm font-medium text-gray-700">Severity</label>
                <select id="sev" value={severity} onChange={(e) => setSeverity(e.target.value)} className="block w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm shadow-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200">
                  {SEVERITIES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
            )}
          </div>

          {/* Summary */}
          <div>
            <label htmlFor="summary" className="mb-1.5 block text-sm font-medium text-gray-700">Summary <span className="text-red-500">*</span></label>
            <textarea id="summary" value={summary} onChange={(e) => setSummary(e.target.value)} onBlur={() => setTouched((p) => ({ ...p, summary: true }))} rows={2} maxLength={300}
              className={cn("block w-full resize-y rounded-xl border bg-white px-4 py-3 text-sm shadow-sm focus:outline-none focus:ring-2", summaryError ? "border-red-300 focus:ring-red-200" : "border-gray-200 focus:border-brand-400 focus:ring-brand-200")} placeholder="Brief summary for the article list" />
            <div className="mt-1.5 flex justify-between">
              {summaryError ? <p className="text-xs text-red-600">{summaryError}</p> : <span />}
              <p className="text-xs text-gray-400">{summary.length}/300</p>
            </div>
          </div>

          {/* Content */}
          <div>
            <label htmlFor="content" className="mb-1.5 block text-sm font-medium text-gray-700">Content <span className="text-red-500">*</span></label>
            <textarea id="content" value={content} onChange={(e) => setContent(e.target.value)} onBlur={() => setTouched((p) => ({ ...p, content: true }))} rows={12}
              className={cn("block w-full resize-y rounded-xl border bg-white px-4 py-3 text-sm shadow-sm focus:outline-none focus:ring-2", contentError ? "border-red-300 focus:ring-red-200" : "border-gray-200 focus:border-brand-400 focus:ring-brand-200")} placeholder="Article content (markdown supported)" />
            {contentError && <p className="mt-1.5 text-xs text-red-600">{contentError}</p>}
            <p className="mt-1 text-xs text-gray-400">Markdown formatting is supported.</p>
          </div>

          {/* Tags */}
          <div>
            <label htmlFor="tags" className="mb-1.5 block text-sm font-medium text-gray-700">Tags</label>
            <input id="tags" type="text" value={tagsInput} onChange={(e) => setTagsInput(e.target.value)} className="block w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm shadow-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200" placeholder="tag1, tag2, tag3" />
            {tags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {tags.map((tag) => <span key={tag} className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">{tag}</span>)}
              </div>
            )}
          </div>

          {/* Options */}
          <div className="space-y-3">
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={isPinned} onChange={(e) => setIsPinned(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500" />
              <span className="text-sm text-gray-700 flex items-center gap-1"><Pin className="h-3.5 w-3.5" />Pin to top</span>
            </label>

            <fieldset>
              <legend className="mb-2 text-sm font-medium text-gray-700">Visibility</legend>
              <div className="flex gap-4">
                {[{v:"all",l:"All tenants"},{v:"specific",l:"Specific tenant"}].map((o) => (
                  <label key={o.v} className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="vis" value={o.v} checked={visibility===o.v} onChange={(e) => setVisibility(e.target.value)} className="h-4 w-4 border-gray-300 text-brand-600" />
                    <span className="text-sm text-gray-700">{o.l}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
          <Link to="/portal/admin/news" className="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</Link>
          <button type="button" onClick={() => submitForm(false)} disabled={isSubmitting} className="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">Save as Draft</button>
          <button type="submit" disabled={isSubmitting} className={cn("inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition", isSubmitting ? "cursor-not-allowed bg-brand-400" : "bg-brand-600 hover:bg-brand-700")}>
            {isSubmitting ? <><Loader2 className="h-4 w-4 animate-spin" />Publishing...</> : "Publish"}
          </button>
        </div>
      </form>
    </div>
  );
}
