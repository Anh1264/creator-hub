import Link from "next/link";
import { StatusPanel } from "@/components/tools/status-panel";
import { toolsFor } from "@/components/tools/registry";
import { IS_HOSTED } from "@/lib/env";

export const metadata = { title: "Tools" };

export default function ToolsPage() {
  return (
    <>
      <div className="crumbs"><span>Hub</span><span>/</span><b>Tools</b></div>
      <div className="page no-cover">
        <h1 className="title">Tools</h1>
        <p className="lede">
          The little utilities you&apos;d otherwise hunt for online. They run {IS_HOSTED ? "in your browser" : "on this computer"}, so files never touch a third-party site.
        </p>

        <section className="block">
          <div className="gallery">
            {toolsFor(IS_HOSTED).map(({ key, href, Icon, name, card, chips }) => (
              <Link key={href} href={href} className="g tool-card" data-tool={key}>
                <div className="g-top"><span className="tool-chip"><Icon /></span><span className="g-name">{name}</span></div>
                <p>{card}</p>
                <div className="chips">{chips.map((c) => <span key={c} className="tag t-gray">{c}</span>)}</div>
              </Link>
            ))}
          </div>
        </section>

        {!IS_HOSTED && (
          <section className="block">
            <div className="db-h"><h2 className="h2">Setup</h2></div>
            <StatusPanel />
          </section>
        )}
      </div>
    </>
  );
}
