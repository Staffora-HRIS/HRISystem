export const EXTENSION_INJECTED_SELECTORS = [
  // Copyleaks (common cause of <copyleaks-sidebar-popup> hydration mismatch)
  "copyleaks-sidebar-popup",
  "copyleaks-sidebar",
  "copyleaks-layout",

  // Grammarly injects multiple custom elements depending on platform/version
  "grammarly-desktop-integration",
  "grammarly-extension",
  "grammarly-mirror",

  // Misc extension patterns
  "[data-grammarly-shadow-root]",
  "[data-grammarly-part]",
];

function removeNodeBestEffort(node: unknown) {
  if (!node) return;

  // Prefer `remove()` where available.
  if (typeof (node as any).remove === "function") {
    try {
      (node as any).remove();
    } catch {
      // Ignore removal errors; best-effort cleanup.
    }
    return;
  }

  // Fallback for older DOMs.
  const parentNode = (node as any).parentNode;
  if (parentNode && typeof parentNode.removeChild === "function") {
    try {
      parentNode.removeChild(node);
    } catch {
      // Ignore removal errors; best-effort cleanup.
    }
  }
}

function removeExtraneousDocumentElements(doc: Document) {
  const documentElement = (doc as any)?.documentElement as unknown;
  const childNodes = (doc as any)?.childNodes as Iterable<unknown> | undefined;

  if (!documentElement || !childNodes) return;

  for (const node of Array.from(childNodes as any)) {
    // Only remove actual elements that are direct children of the document.
    // (doctype and comments are fine.)
    const isElement = (node as any)?.nodeType === 1;
    if (!isElement) continue;

    // Never remove the real <html> element.
    if (node === documentElement) continue;

    removeNodeBestEffort(node);
  }
}

/**
 * Removes known browser-extension injected nodes prior to React hydration.
 *
 * Why this exists:
 * - Our app performs full-document hydration (SSR renders <html>).
 * - Some extensions inject extra nodes into <html>/<head>/<body> before hydration.
 * - Those nodes are not in the server-rendered markup, causing React hydration to fail.
 *
 * This function is intentionally conservative: it only removes a small allowlist of
 * well-known extension-injected nodes.
 */
export function sanitizeDocumentForReactHydration(doc: Document) {
  // Some extensions inject elements as direct children of `document` (siblings to <html>).
  // When we hydrate the full document, React expects a single <html> root. Extra
  // nodes here can lead to errors like:
  // - "<div> cannot appear as a child of <#document>"
  // - "Only one element on document allowed"
  removeExtraneousDocumentElements(doc);

  // Guard against non-browser/test environments or malformed `doc`.
  const querySelectorAll = (doc as any)?.querySelectorAll as
    | ((selectors: string) => Iterable<unknown>)
    | undefined;

  if (!querySelectorAll) return;

  const selector = EXTENSION_INJECTED_SELECTORS.join(",");

  let nodes: Iterable<unknown>;
  try {
    nodes = querySelectorAll.call(doc, selector);
  } catch {
    // If selector parsing fails in an unusual environment, don't block hydration.
    return;
  }

  for (const node of Array.from(nodes as any)) {
    removeNodeBestEffort(node);
  }
}
