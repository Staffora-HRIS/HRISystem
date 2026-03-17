import { useState, useEffect, useCallback } from "react";
import { Link, useParams } from "react-router";
import {
  ArrowLeft,
  ChevronRight,
  Calendar,
  User,
  Eye,
  Tag,
  AlertTriangle,
  RefreshCw,
  ArrowRight,
} from "lucide-react";
import { cn } from "~/lib/utils";
import { portalApi } from "~/lib/portal-api";

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

interface RelatedArticle {
  slug: string;
  title: string;
  summary: string;
  publishedAt: string;
  category: string;
}

interface NewsArticleDetail {
  slug: string;
  title: string;
  content: string;
  summary: string;
  publishedAt: string;
  category: string;
  severity?: "info" | "warning" | "critical";
  authorName: string;
  coverImageUrl?: string;
  tags: string[];
  viewCount: number;
  relatedArticles: RelatedArticle[];
}

/* -------------------------------------------------------------------------- */
/*  Constants                                                                  */
/* -------------------------------------------------------------------------- */

const CATEGORY_COLORS: Record<string, string> = {
  announcements: "bg-brand-100 text-brand-700",
  feature_updates: "bg-green-100 text-green-700",
  incidents: "bg-red-100 text-red-700",
  tips: "bg-amber-100 text-amber-700",
  security: "bg-purple-100 text-purple-700",
};

const SEVERITY_COLORS: Record<string, string> = {
  info: "bg-blue-100 text-blue-700",
  warning: "bg-amber-100 text-amber-700",
  critical: "bg-red-100 text-red-700",
};

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatLabel(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/* -------------------------------------------------------------------------- */
/*  Component                                                                  */
/* -------------------------------------------------------------------------- */

export function meta() {
  return [{ title: "News Article - Staffora Client Portal" }];
}

export default function NewsDetailPage() {
  const { slug } = useParams();
  const [article, setArticle] = useState<NewsArticleDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchArticle = useCallback(async () => {
    if (!slug) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = (await portalApi.news.get(slug)) as {
        data: NewsArticleDetail;
      };
      setArticle(res.data);
    } catch {
      setError("Failed to load article. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    fetchArticle();
  }, [fetchArticle]);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl space-y-6 animate-pulse">
        <div className="h-5 w-24 rounded bg-gray-200" />
        <div className="h-10 w-full rounded bg-gray-200" />
        <div className="h-64 rounded-2xl bg-gray-200" />
        <div className="space-y-3">
          <div className="h-4 w-full rounded bg-gray-100" />
          <div className="h-4 w-5/6 rounded bg-gray-100" />
          <div className="h-4 w-4/6 rounded bg-gray-100" />
        </div>
      </div>
    );
  }

  if (error && !article) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-gray-200 bg-white py-16 px-6 text-center">
        <AlertTriangle className="h-12 w-12 text-red-400" />
        <h3 className="mt-4 text-lg font-semibold text-gray-900">
          Failed to load article
        </h3>
        <p className="mt-1.5 text-sm text-gray-500">{error}</p>
        <button
          onClick={fetchArticle}
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 transition"
        >
          <RefreshCw className="h-4 w-4" />
          Retry
        </button>
      </div>
    );
  }

  if (!article) return null;

  return (
    <div className="mx-auto max-w-3xl space-y-6 animate-fade-in">
      {/* Breadcrumb */}
      <nav
        className="flex items-center gap-1.5 text-sm text-gray-500"
        aria-label="Breadcrumb"
      >
        <Link
          to="/portal/news"
          className="inline-flex items-center gap-1 hover:text-brand-600 transition"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          News
        </Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="font-medium text-gray-900 truncate max-w-xs">
          {article.title}
        </span>
      </nav>

      {/* Article */}
      <article className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
        {/* Cover image */}
        {article.coverImageUrl && (
          <div className="aspect-[2/1] w-full bg-gray-100">
            <img
              src={article.coverImageUrl}
              alt=""
              className="h-full w-full object-cover"
            />
          </div>
        )}

        <div className="p-8">
          {/* Badges */}
          <div className="flex items-center gap-2 flex-wrap mb-4">
            <span
              className={cn(
                "rounded-full px-2.5 py-0.5 text-xs font-medium",
                CATEGORY_COLORS[article.category] ||
                  "bg-gray-100 text-gray-600",
              )}
            >
              {formatLabel(article.category)}
            </span>
            {article.severity && (
              <span
                className={cn(
                  "rounded-full px-2.5 py-0.5 text-xs font-medium",
                  SEVERITY_COLORS[article.severity],
                )}
              >
                {article.severity.charAt(0).toUpperCase() +
                  article.severity.slice(1)}
              </span>
            )}
          </div>

          {/* Title */}
          <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">
            {article.title}
          </h1>

          {/* Meta */}
          <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-gray-500">
            <span className="flex items-center gap-1.5">
              <Calendar className="h-4 w-4" />
              {formatDate(article.publishedAt)}
            </span>
            <span className="flex items-center gap-1.5">
              <User className="h-4 w-4" />
              {article.authorName}
            </span>
            <span className="flex items-center gap-1.5">
              <Eye className="h-4 w-4" />
              {article.viewCount} views
            </span>
          </div>

          {/* Content */}
          <div className="prose prose-sm mt-8 max-w-none text-gray-700 leading-relaxed">
            <div className="whitespace-pre-wrap">{article.content}</div>
          </div>

          {/* Tags */}
          {article.tags && article.tags.length > 0 && (
            <div className="mt-8 flex items-center gap-2 flex-wrap border-t border-gray-100 pt-6">
              <Tag className="h-4 w-4 text-gray-400" />
              {article.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </article>

      {/* Related articles */}
      {article.relatedArticles && article.relatedArticles.length > 0 && (
        <div>
          <h2 className="mb-4 text-lg font-semibold text-gray-900">
            Related Articles
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {article.relatedArticles.slice(0, 3).map((related) => (
              <Link
                key={related.slug}
                to={`/portal/news/${related.slug}`}
                className="group rounded-xl border border-gray-200 bg-white p-4 transition hover:border-gray-300 hover:shadow-md"
              >
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-xs font-medium",
                    CATEGORY_COLORS[related.category] ||
                      "bg-gray-100 text-gray-600",
                  )}
                >
                  {formatLabel(related.category)}
                </span>
                <h3 className="mt-2 text-sm font-semibold text-gray-900 group-hover:text-brand-600 transition line-clamp-2">
                  {related.title}
                </h3>
                <p className="mt-1 line-clamp-2 text-xs text-gray-500">
                  {related.summary}
                </p>
                <span className="mt-2 flex items-center gap-1 text-xs font-medium text-brand-600 opacity-0 transition-opacity group-hover:opacity-100">
                  Read more
                  <ArrowRight className="h-3 w-3" />
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Back link */}
      <div>
        <Link
          to="/portal/news"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700 transition"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to news
        </Link>
      </div>
    </div>
  );
}
