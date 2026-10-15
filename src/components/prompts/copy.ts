/** Clipboard write with a fallback for plain-http pages (e.g. the hub opened over the LAN). */
export async function copyText(value: string) {
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    const t = document.createElement("textarea");
    t.value = value;
    t.style.position = "fixed";
    t.style.opacity = "0";
    document.body.appendChild(t);
    t.select();
    document.execCommand("copy");
    t.remove();
  }
}
