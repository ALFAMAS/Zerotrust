// One-off codemod: map hardcoded Tailwind gray/indigo utilities to shadcn
// semantic tokens across the UI. Order matters (specific before generic).
import { readdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const ROOT = process.argv[2];
const DRY = process.argv.includes("--dry");

const REPLACEMENTS = [
  // ── indigo / primary ──
  [/\bhover:bg-indigo-(?:500|600)\b/g, "hover:bg-primary/90"],
  [/\bbg-indigo-(?:500|600)\b/g, "bg-primary"],
  [/\bbg-indigo-950\/50\b/g, "bg-primary/10"],
  [/\bhover:text-indigo-(?:300|400)\b/g, "hover:text-primary/80"],
  [/\btext-indigo-(?:300|400)\b/g, "text-primary"],
  [/\bfocus:border-indigo-500\b/g, "focus:border-ring"],
  [/\bfocus:ring-indigo-500\b/g, "focus:ring-ring"],
  [/\bring-indigo-500\b/g, "ring-ring"],
  [/\bborder-indigo-(?:500|600)\b/g, "border-primary"],
  [/\bborder-indigo-800\b/g, "border-primary/40"],
  // ── grays: backgrounds ──
  [/\bbg-gray-950\b/g, "bg-background"],
  [/\bbg-gray-900\b/g, "bg-card"],
  [/\bhover:bg-gray-(?:700|800)\b/g, "hover:bg-accent"],
  [/\bbg-gray-800\b/g, "bg-muted"],
  // ── grays: borders ──
  [/\bhover:border-gray-(?:500|600|700)\b/g, "hover:border-border"],
  [/\bborder-gray-(?:600|700|800)\b/g, "border-border"],
  // ── grays: text ──
  [/\bhover:text-white\b/g, "hover:text-foreground"],
  [/\btext-white\b/g, "text-foreground"],
  [/\btext-gray-100\b/g, "text-foreground"],
  [/\btext-gray-300\b/g, "text-foreground/80"],
  [/\btext-gray-(?:400|500|600)\b/g, "text-muted-foreground"],
  // ── placeholders ──
  [/\bplaceholder-gray-500\b/g, "placeholder:text-muted-foreground"],
  [/\bplaceholder:text-gray-500\b/g, "placeholder:text-muted-foreground"],
];

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (extname(p) === ".tsx") out.push(p);
  }
  return out;
}

let changed = 0;
let totalSubs = 0;
for (const file of walk(ROOT)) {
  const src = readFileSync(file, "utf8");
  let out = src;
  let subs = 0;
  for (const [re, to] of REPLACEMENTS) {
    out = out.replace(re, () => {
      subs++;
      return to;
    });
  }
  if (out !== src) {
    changed++;
    totalSubs += subs;
    if (!DRY) writeFileSync(file, out);
    console.log(`${subs.toString().padStart(4)}  ${file}`);
  }
}
console.log(`\n${DRY ? "[dry] " : ""}${changed} files, ${totalSubs} substitutions`);
