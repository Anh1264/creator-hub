import Link from "next/link";

export default function NotFound() {
  return (
    <div className="page no-cover">
      <h1 className="title">Not <em>here</em></h1>
      <p className="muted">That collab or page doesn&apos;t exist (it may have been deleted).</p>
      <p style={{ marginTop: 16 }}><Link className="btn" href="/">Back to overview</Link></p>
    </div>
  );
}
