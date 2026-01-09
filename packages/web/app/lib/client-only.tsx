import { useEffect, useState, type ReactNode } from "react";

/**
 * ClientOnly
 *
 * Renders children only after the component has mounted on the client.
 *
 * Why:
 * - Our app uses full-document SSR (<html> is rendered on the server).
 * - Some purely-client components (e.g. devtools overlays) render extra DOM that
 *   does not exist in the server markup.
 * - Rendering those components during hydration causes mismatches and can trigger
 *   React to attempt to insert nodes at the #document level.
 */
export function ClientOnly({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;
  return <>{children}</>;
}
