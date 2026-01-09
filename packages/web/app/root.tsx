import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  isRouteErrorResponse,
  useRouteError,
} from "react-router";
import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { queryClient } from "./lib/query-client";
import { ToastProvider, ToastViewport } from "./components/ui/toast";
import { ThemeProvider, useTheme } from "./lib/theme";
import { ClientOnly } from "./lib/client-only";
import type { Route } from "./+types/root";
import "./styles/globals.css";

export const links: Route.LinksFunction = () => [
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  {
    rel: "preconnect",
    href: "https://fonts.gstatic.com",
    crossOrigin: "anonymous",
  },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap",
  },
];

export function meta(): Route.MetaDescriptors {
  return [
    { title: "HRIS Platform" },
    { name: "description", content: "Human Resource Information System" },
    { name: "viewport", content: "width=device-width, initial-scale=1" },
  ];
}

function Document({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme();

  return (
    <html lang="en" className={theme} suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <Meta />
        <Links />
        {/* Prevent flash of wrong theme */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                const theme = localStorage.getItem('hris-theme') || 'light';
                document.documentElement.classList.add(theme);
              })();
            `,
          }}
        />
      </head>
      <body className="min-h-screen bg-white text-gray-900 antialiased dark:bg-gray-900 dark:text-gray-100">
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <ToastProvider>
          <Document>
            <Outlet />
            <ToastViewport />
            {/*
             * ReactQueryDevtools renders DOM that does not exist in SSR markup and can
             * cause hydration mismatches in full-document SSR. Render it client-only
             * and inside <body> (i.e., inside Document) to keep the document tree valid.
             */}
            {import.meta.env.DEV ? (
              <ClientOnly>
                <ReactQueryDevtools initialIsOpen={false} />
              </ClientOnly>
            ) : null}
          </Document>
        </ToastProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();

  let status = 500;
  let message = "An unexpected error occurred";
  let description = "Please try again later or contact support if the problem persists.";

  if (isRouteErrorResponse(error)) {
    status = error.status;
    switch (error.status) {
      case 401:
        message = "Unauthorized";
        description = "You need to be logged in to access this page.";
        break;
      case 403:
        message = "Forbidden";
        description = "You don't have permission to access this page.";
        break;
      case 404:
        message = "Page Not Found";
        description = "The page you're looking for doesn't exist.";
        break;
      default:
        message = error.statusText || message;
        description = error.data?.message || description;
    }
  } else if (error instanceof Error) {
    message = error.message;
    description = error.stack || description;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <Document>
          <div className="flex min-h-screen flex-col items-center justify-center px-4">
            <div className="text-center">
              <h1 className="text-6xl font-bold text-primary-600">{status}</h1>
              <h2 className="mt-4 text-2xl font-semibold text-gray-900 dark:text-gray-100">
                {message}
              </h2>
              <p className="mt-2 text-gray-600 dark:text-gray-400">
                {description}
              </p>
              <div className="mt-8 flex justify-center gap-4">
                <a
                  href="/"
                  className="inline-flex items-center rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
                >
                  Go Home
                </a>
                <button
                  onClick={() => window.history.back()}
                  className="inline-flex items-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                >
                  Go Back
                </button>
              </div>
            </div>
          </div>
        </Document>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export function HydrateFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary-200 border-t-primary-600" />
    </div>
  );
}
