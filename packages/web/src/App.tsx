import { BrowserRouter, Routes, Route } from "react-router";

function HomePage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="text-center">
          <h1 className="text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl md:text-6xl">
            Staffora
          </h1>
          <p className="mx-auto mt-3 max-w-md text-base text-gray-500 sm:text-lg md:mt-5 md:max-w-3xl md:text-xl">
            Enterprise Human Resource Information System by Staffora
          </p>
          <div className="mx-auto mt-10 max-w-sm">
            <div className="rounded-lg bg-white p-6 shadow-lg">
              <h2 className="text-lg font-semibold text-gray-900">
                Getting Started
              </h2>
              <p className="mt-2 text-sm text-gray-600">
                The Staffora platform is under construction. Check back soon for
                updates.
              </p>
              <div className="mt-4">
                <span className="inline-flex items-center rounded-full bg-primary-100 px-3 py-0.5 text-sm font-medium text-primary-800">
                  Phase 1: Infrastructure
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function NotFoundPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="text-center">
        <h1 className="text-6xl font-bold text-gray-900">404</h1>
        <p className="mt-4 text-xl text-gray-600">Page not found</p>
        <a
          href="/"
          className="mt-6 inline-block rounded-md bg-primary-600 px-4 py-2 text-white hover:bg-primary-700"
        >
          Go home
        </a>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  );
}
