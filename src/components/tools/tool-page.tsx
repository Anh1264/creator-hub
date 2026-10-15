import Link from "next/link";
import { tool, type ToolKey } from "./registry";

/**
 * Shared frame for every tool page: a cover in the tool's own colour and pattern, an icon tile,
 * and the tool's colour as the page accent (drop zone, buttons, progress bars all pick it up).
 */
export function ToolPage({ id, title, lede, children }: { id: ToolKey; title?: React.ReactNode; lede: React.ReactNode; children: React.ReactNode }) {
  const t = tool(id);
  return (
    <div className="tool-page" data-tool={id}>
      <div className="crumbs"><span className="hide-m">Hub</span><span className="hide-m">/</span><Link href="/tools">Tools</Link><span>/</span><b>{t.name}</b></div>
      <div className="tool-cover" aria-hidden />
      <div className="page">
        <div className="page-ico tool-ico"><t.Icon /></div>
        <h1 className="title">{title ?? t.name}</h1>
        <p className="lede">{lede}</p>
        {children}
      </div>
    </div>
  );
}
