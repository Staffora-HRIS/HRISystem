import { startTransition, StrictMode } from "react";
import { hydrateRoot } from "react-dom/client";
import { HydratedRouter } from "react-router/dom";

import { sanitizeDocumentForReactHydration } from "./lib/hydration";

export function startClientHydration() {
  // Browser extensions (e.g., Copyleaks/Grammarly) sometimes inject DOM nodes into
  // <html>/<body> before React hydrates. Because our app hydrates the full document
  // (SSR renders <html>), those injected nodes cause hydration mismatches.
  //
  // When hydration fails, React falls back to client rendering and may attempt to
  // re-create the document tree, which can trigger DOM exceptions such as:
  // "Only one element on document allowed".
  sanitizeDocumentForReactHydration(document);

  startTransition(() => {
    hydrateRoot(
      document,
      <StrictMode>
        <HydratedRouter />
      </StrictMode>
    );
  });
}

// In Vitest, we want to be able to import this module without triggering hydration.
// Vitest injects `import.meta.vitest` during test runs.
if (!(import.meta as any).vitest) {
  startClientHydration();
}
