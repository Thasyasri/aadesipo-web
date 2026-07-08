import { useEffect } from "react";

/**
 * Set the document <title> and <meta name="description"> for a route, restoring
 * the previous values on unmount. Social scrapers read the static tags in
 * index.html (they don't run JS), so this is mainly for browser tabs and
 * JS-rendering crawlers like Google — a lightweight alternative to react-helmet.
 */
export function useDocumentMeta(title: string, description?: string) {
  useEffect(() => {
    const prevTitle = document.title;
    document.title = title;

    let meta: HTMLMetaElement | null = null;
    let prevDesc: string | null = null;
    if (description) {
      meta = document.querySelector('meta[name="description"]');
      if (!meta) {
        meta = document.createElement("meta");
        meta.setAttribute("name", "description");
        document.head.appendChild(meta);
      }
      prevDesc = meta.getAttribute("content");
      meta.setAttribute("content", description);
    }

    return () => {
      document.title = prevTitle;
      if (meta && prevDesc !== null) meta.setAttribute("content", prevDesc);
    };
  }, [title, description]);
}
