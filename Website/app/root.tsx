import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  isRouteErrorResponse,
  useRouteError,
} from "react-router";
import "./styles/globals.css";

export function meta() {
  return [
    { title: "Staffora - Modern HR Management for Growing Teams" },
    {
      name: "description",
      content:
        "All-in-one HR platform with payroll, time tracking, leave management, performance reviews, and more. Built for companies of every size.",
    },
    {
      name: "viewport",
      content: "width=device-width, initial-scale=1, viewport-fit=cover",
    },
  ];
}

export function links() {
  return [
    { rel: "preconnect", href: "https://fonts.googleapis.com" },
    {
      rel: "preconnect",
      href: "https://fonts.gstatic.com",
      crossOrigin: "anonymous" as const,
    },
    {
      rel: "stylesheet",
      href: "https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&family=Open+Sans:wght@400;500;600;700&display=swap",
    },
  ];
}

export default function App() {
  return (
    <html lang="en" className="scroll-smooth">
      <head>
        <meta charSet="utf-8" />
        <Meta />
        <Links />
      </head>
      <body className="min-h-screen bg-white text-gray-900 antialiased font-sans">
        <Outlet />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();

  let status = 500;
  let message = "Something went wrong";

  if (isRouteErrorResponse(error)) {
    status = error.status;
    message = error.status === 404 ? "Page not found" : error.statusText;
  }

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <Meta />
        <Links />
      </head>
      <body className="min-h-screen bg-white font-sans antialiased">
        <div className="flex min-h-screen flex-col items-center justify-center px-4">
          <h1 className="text-7xl font-extrabold text-brand-600">{status}</h1>
          <p className="mt-4 text-xl text-gray-600">{message}</p>
          <a
            href="/"
            className="mt-8 rounded-full bg-brand-600 px-6 py-3 text-sm font-semibold text-white hover:bg-brand-700 transition"
          >
            Back to Home
          </a>
        </div>
        <Scripts />
      </body>
    </html>
  );
}
