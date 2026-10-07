// Local store used when Supabase isn't configured. Saved to .tools/data/hub.json on this computer,
// so collabs and posts survive restarts. The seed below is only used the very first time.
import "server-only";
import { load, save } from "../local/db";
import type { Collab, CollabInput, Post, PostInput } from "../domain";
import type { Repo } from "./types";

type Store = { collabs: Collab[]; posts: Post[] };

let seq = 0;
const id = () => `demo-${Date.now().toString(36)}-${(seq++).toString(36)}`;

// Real Creative Partner Program (CPP) data, taken from the programs' emails.
// Tracking starts 2026-10; actual join dates are in each collab's notes.
// No posts are seeded — log real posts in the app.
function seed(): Store {
  const now = new Date().toISOString();
  const c = (
    name: string, color: string, platforms: string[], quota: number, notes: string,
    endMonth: string | null = null,
  ): Collab => ({
    id: id(), name, color, platforms, monthlyQuota: quota, startMonth: "2026-10", endMonth,
    notes, archived: false, createdAt: now,
  });

  const pollo = c("Pollo AI", "#B5532C", ["Pollo AI site", "Instagram", "TikTok"], 6, [
    "Joined CPP: Jul 2, 2026.",
    "",
    "To stay in the CPP — every calendar month (welcome email, Jul 2, 2026):",
    "• At least 5 videos published PUBLIC on the Pollo AI website. Turn on \"Public Visibility\" in Create settings BEFORE generating; private videos can't be made public later.",
    "• At least 1 social media post featuring Pollo AI content (use #PolloAI and tag Pollo AI).",
    "Quota of 6 here = 5 public site videos + 1 social post.",
    "Inactive CPPs may be removed from the program.",
    "",
    "Reward: 2,000 monthly active credits, issued on the 5th–10th of the following month. Reward credits are valid 2 months from issuance (CPP upgrade, effective Aug 3, 2026).",
    "",
    "Optional extra credits: from Oct 10, 2026 the Bi-Weekly Challenge becomes Official Theme Challenges. Submit 5+ eligible videos to one challenge for 1,000 credits (email, Sep 28, 2026).",
    "",
    "Full rules: CPP Handbook — https://app.notion.com/p/PolloAI-Creative-Partner-Program-CPP-Benefits-Rules-Guide-3a7e5290ca698034a82fc90334b3c84b",
  ].join("\n"));

  const dreamina = c("Dreamina AI", "#3F5BA9", ["Dreamina site", "TikTok", "Instagram", "X", "YouTube"], 0, [
    "Invited to CPP: Aug 14, 2026. Current season: Aug – Dec 31, 2026.",
    "",
    "No minimum post count. Credits are paid per post.",
    "",
    "Rules to stay eligible (season email, Aug 17, 2026):",
    "• At least 30% of your content must be made with Dreamina AI.",
    "• Content must be original or fully licensed, with no third-party IP infringement.",
    "• Content must stay public for 60 days after the program ends. Don't delete, hide, or set it to private.",
    "• Social posts need #DreaminaCPP and a mention of @dreamina_cpp in the caption. Only accounts submitted through the CPP account form are tracked. (The Aug 14 invite said @dreamina_ai.)",
    "",
    "Base perks: Standard membership + 10,000 credits/month.",
    "Per-post credits: social media posts get 1,000 (≤60s) or 10,000 (>60s), capped at 50,000/month. Posts on the dreamina.ai website pay the same rates with a separate 50,000/month cap.",
    "Performance reward (>60s videos, organic views within 7 days): A-level (TikTok/IG 500K, X/YT 100K) earns 50,000. S-level (TikTok/IG 1M, X/YT 500K) earns 100,000. Capped at 200,000/month. Claim via the submission form within 7 days of publishing.",
    "",
    "Aug 21, 2026 email: confirm your participation via the form so the new model applies (from Aug 24).",
  ].join("\n"), "2026-12");

  const capcut = c("CapCut", "#5A6472", [], 0, [
    "Joined CPP: Aug 24, 2026 (welcome email from CapCut Vietnam, handle byaidenvu).",
    "The welcome email lists no posting requirements.",
  ].join("\n"));

  const kinovi = c("Kinovi AI", "#7B4B94", [], 5, [
    "Joined CPP: Jun 29, 2026.",
    "",
    "Monthly requirement (credits emails, latest Aug 30, 2026):",
    "• Post 5+ pieces each month.",
    "• Submit your posts through the CPP form before the monthly review. The form may change, so check it. Reminder email arrives near month-end: https://docs.google.com/forms/d/1X_VGnAI8lkpOrkqvd_4QB0fdAHR3A5a_zrs7z0ccfh0/viewform",
    "• Credits are adjusted by posting frequency, traffic, platform coefficient, and manual review.",
    "Also: include \"cpp @Kinovi\" in your bio (welcome email).",
    "",
    "Rewards: a credits code each cycle (2,000 in Jun; 5,000 in Jul and Aug) + 5% commission on purchases from referrals.",
  ].join("\n"));

  const wavespeed = c("WaveSpeedAI", "#1F7A74", [], 0, [
    "Joined Creator Program: Sep 11, 2026.",
    "The welcome email lists no posting requirements.",
    "First month: 20-credit coupon. Join their Discord and DM @Yvonne_ws with your social link + email to claim it.",
  ].join("\n"));

  return { collabs: [pollo, dreamina, capcut, kinovi, wavespeed], posts: [] };
}

const store = () => load<Store>("hub", seed);
const persist = () => save("hub");

export const demoRepo: Repo = {
  async listCollabs() { return [...store().collabs]; },
  async getCollab(cid) { return store().collabs.find((c) => c.id === cid) ?? null; },
  async createCollab(input: CollabInput) {
    const c: Collab = { ...input, id: id(), createdAt: new Date().toISOString() };
    store().collabs.push(c);
    persist();
    return c;
  },
  async updateCollab(cid, patch) {
    const c = store().collabs.find((x) => x.id === cid);
    if (c) Object.assign(c, patch);
    persist();
  },
  async deleteCollab(cid) {
    const s = store();
    s.collabs = s.collabs.filter((c) => c.id !== cid);
    s.posts = s.posts.filter((p) => p.collabId !== cid);
    persist();
  },
  async listPosts() { return [...store().posts]; },
  async getPost(pid) { return store().posts.find((p) => p.id === pid) ?? null; },
  async createPost(input: PostInput) {
    const p: Post = { ...input, id: id(), createdAt: new Date().toISOString() };
    store().posts.push(p);
    persist();
    return p;
  },
  async updatePost(pid, patch) {
    const p = store().posts.find((x) => x.id === pid);
    if (p) Object.assign(p, patch);
    persist();
  },
  async deletePost(pid) {
    const s = store();
    s.posts = s.posts.filter((p) => p.id !== pid);
    persist();
  },
};
