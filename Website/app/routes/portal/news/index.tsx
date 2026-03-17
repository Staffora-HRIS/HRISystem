import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router";
import {
  Search,
  Newspaper,
  ArrowRight,
  Pin,
  Eye,
  ChevronLeft,
  ChevronRight,
  AlertTriangle as AlertTriangleIcon,
} from "lucide-react";
import { cn } from "~/lib/utils";
import { portalApi } from "~/lib/portal-api";

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

interface NewsArticle {
  slug: string;
  title: string;
  summary: string;
  publishedAt: string;
  category: string;
  severity?: "info" | "warning" | "critical";
  authorName: string;
  isPinned: boolean;
  isRead: boolean;
  viewCount: number;
  coverImageUrl?: string;
}

interface NewsListResponse {
  data: NewsArticle[];
  pagination: {
    hasMore: boolean;
    nextCursor: string | null;
    prevCursor: string | null;
    total: number;
  };
}

/* -------------------------------------------------------------------------- */
/*  Constants                                                                  */
/* -------------------------------------------------------------------------- */

const CATEGORY_TABS = [
  { value: "", label: "All" },
  { value: "announcements", label: "Announcements" },
  { value: "feature_updates", label: "Feature Updates" },
  { value: "incidents", label: "Incidents" },
  { value: "tips", label: "Tips" },
  { value: "security", label: "Security" },
];

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
    month: "short",
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
  return [{ title: "News & Updates - Staffora Client Portal" }];
}

export default function NewsPage() {
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState<NewsListResponse["pagination"]>({
    hasMore: false,
    nextCursor: null,
    prevCursor: null,
    total: 0,
  });

  const [category, setCategory] = useState("");
  const [search, setSearch] = useState("");
  const [cursor, setCursor] = useState<string | null>(null);
  const [direction, setDirection] = useState<"next" | "prev">("next");

  const fetchNews = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (category) params.set("category", category);
      if (search.trim()) params.set("search", search.trim());
      if (cursor) {
        params.set("cursor", cursor);
        params.set("direction", direction);
      }
      params.set("limit", "10");
      const res = (await portalApi.news.list(params)) as NewsListResponse;
      setArticles(res.data);
      setPagination(res.pagination);
    } catch {
      setError("Failed to load news articles. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, [category, search, cursor, direction]);

  useEffect(() => {
    fetchNews();
  }, [fetchNews]);

  useEffect(() => {
    setCursor(null);
  }, [category, search]);

  const pinnedArticles = articles.filter((a) => a.isPinned);
  const regularArticles = articles.filter((a) => !a.isPinned);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">News & Updates</h1>
        <p className="mt-1 text-sm text-gray-500">
          Stay up to date with product updates, maintenance notices, and
          compliance news.
        </p>
      </div>

      {/* Category tabs */}
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="News categories">
        {CATEGORY_TABS.map((tab) => (
          <button
            key={tab.value}
            role="tab"
            aria-selected={category === tab.value}
            onClick={() => setCategory(tab.value)}
            className={cn(
              "rounded-full px-4 py-1.5 text-sm font-medium transition",
              category === tab.value
                ? "bg-brand-600 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search articles..."
          className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-4 text-sm text-gray-700 placeholder:text-gray-400 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200"
          aria-label="Search articles"
        />
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700" role="alert">
          {error}
          <button onClick={fetchNews} className="ml-2 font-medium underline hover:no-underline">
            Retry
          </button>
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-56 animate-pulse rounded-2xl border border-gray-200 bg-gray-100"
            />
          ))}
        </div>
      )}

      {/* Empty */}
      {!isLoading && !error && articles.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-gray-200 bg-white py-16 px-6 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-50">
            <Newspaper className="h-8 w-8 text-brand-400" />
          </div>
          <h3 className="mt-4 text-lg font-semibold text-gray-900">
            No articles found
          </h3>
          <p className="mt-1.5 max-w-sm text-sm text-gray-500">
            {search || category
              ? "Try adjusting your filters to find what you're looking for."
              : "No news articles have been published yet. Check back later."}
          </p>
        </div>
      )}

      {/* Pinned articles */}
      {!isLoading && !error && pinnedArticles.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Pin className="h-4 w-4 text-brand-600" />
            <h2 className="text-sm font-semibold text-gray-700">Pinned</h2>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {pinnedArticles.map((article) => (
              <ArticleCard key={article.slug} article={article} />
            ))}
          </div>
        </div>
      )}

      {/* Regular articles */}
      {!isLoading && !error && regularArticles.length > 0 && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {regularArticles.map((article) => (
            <ArticleCard key={article.slug} article={article} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {!isLoading && !error && articles.length > 0 && (
        <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-5 py-3">
          <button
            onClick={() => {
              if (pagination.prevCursor) {
                setDirection("prev");
                setCursor(pagination.prevCursor);
              }
            }}
            disabled={!pagination.prevCursor}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition",
              pagination.prevCursor
                ? "text-gray-700 hover:bg-gray-100"
                : "cursor-not-allowed text-gray-300",
            )}
            aria-label="Previous page"
          >
            <ChevronLeft className="h-4 w-4" />
            Previous
          </button>
          <button
            onClick={() => {
              if (pagination.nextCursor) {
                setDirection("next");
                setCursor(pagination.nextCursor);
              }
            }}
            disabled={!pagination.hasMore}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition",
              pagination.hasMore
                ? "text-gray-700 hover:bg-gray-100"
                : "cursor-not-allowed text-gray-300",
            )}
            aria-label="Next page"
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Article Card                                                               */
/* -------------------------------------------------------------------------- */

function ArticleCard({ article }: { article: NewsArticle }) {
  return (
    <Link
      to={`/portal/news/${article.slug}`}
      className="group flex flex-col rounded-2xl border border-gray-200 bg-white p-5 transition hover:border-gray-300 hover:shadow-lg"
    >
      <div className="flex items-center gap-2 flex-wrap">
        <span
          className={cn(
            "rounded-full px-2.5 py-0.5 text-xs font-medium",
            CATEGORY_COLORS[article.category] || "bg-gray-100 text-gray-600",
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
            {article.severity === "critical" && (
              <AlertTriangleIcon className="mr-1 inline h-3 w-3" />
            )}
            {article.severity.charAt(0).toUpperCase() + article.severity.slice(1)}
          </span>
        )}
        {!article.isRead && (
          <span className="flex h-2 w-2 rounded-full bg-brand-500" title="Unread" />
        )}
        {article.isPinned && (
          <Pin className="h-3.5 w-3.5 text-brand-500" />
        )}
      </div>

      <h3 className="mt-3 text-base font-semibold text-gray-900 group-hover:text-brand-600 transition line-clamp-2">
        {article.title}
      </h3>

      <p className="mt-2 flex-1 line-clamp-3 text-sm text-gray-500 leading-relaxed">
        {article.summary}
      </p>

      <div className="mt-4 flex items-center justify-between text-xs text-gray-400">
        <div className="flex items-center gap-3">
          <span>{formatDate(article.publishedAt)}</span>
          <span>{article.authorName}</span>
        </div>
        <div className="flex items-center gap-1">
          <Eye className="h-3 w-3" />
          <span>{article.viewCount}</span>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-1 text-sm font-medium text-brand-600 opacity-0 transition-opacity group-hover:opacity-100">
        Read more
        <ArrowRight className="h-3.5 w-3.5" />
      </div>
    </Link>
  );
}
