#!/usr/bin/env node

// Installer for @lukasz-rdzanek/unstuck-ai-toolkit (M5L4).
// Copies skills into the consumer's .claude/skills, injects team rules into
// CLAUDE.md between sentinel markers (idempotent), and records a manifest so
// uninstall removes exactly what was added. Adapted from the m5l4 GitHub
// Packages installer template.

const fs = require("node:fs");
const path = require("node:path");

const PACKAGE_NAME = "@lukasz-rdzanek/unstuck-ai-toolkit";
const PACKAGE_VERSION = "0.1.0";
const BEGIN = `<!-- BEGIN ${PACKAGE_NAME} -->`;
const END = `<!-- END ${PACKAGE_NAME} -->`;
const MANIFEST = ".unstuck-ai-toolkit-manifest.json";

function findProjectRoot() {
  if (process.env.PROJECT_ROOT) return process.env.PROJECT_ROOT;
  let dir = __dirname;
  while (dir !== path.dirname(dir)) {
    if (path.basename(dir) === "node_modules") return path.dirname(dir);
    dir = path.dirname(dir);
  }
  return process.cwd();
}

function copyDir(source, target, installedFiles, root) {
  fs.mkdirSync(target, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const src = path.join(source, entry.name);
    const dst = path.join(target, entry.name);
    if (entry.isDirectory()) {
      copyDir(src, dst, installedFiles, root);
    } else {
      fs.copyFileSync(src, dst);
      installedFiles.push(path.relative(root, dst));
    }
  }
}

function installSkills(projectRoot, installedFiles) {
  const source = path.join(__dirname, "skills");
  if (!fs.existsSync(source)) return;
  const targetRoot = path.join(projectRoot, ".claude", "skills");
  fs.mkdirSync(targetRoot, { recursive: true });
  for (const skill of fs.readdirSync(source, { withFileTypes: true })) {
    if (!skill.isDirectory()) continue;
    const target = path.join(targetRoot, skill.name);
    fs.rmSync(target, { recursive: true, force: true });
    copyDir(path.join(source, skill.name), target, installedFiles, projectRoot);
  }
}

function applyRulesBlock(existing, teamRules) {
  const block = `${BEGIN}\n${teamRules.trim()}\n${END}`;
  const start = existing.indexOf(BEGIN);
  const end = existing.indexOf(END);
  // Corrupted block (one marker missing) → don't guess; warn and append fresh.
  if ((start === -1) !== (end === -1)) {
    console.warn(`${PACKAGE_NAME}: damaged sentinel block in CLAUDE.md — appending a fresh block.`);
    return existing.trimEnd() + "\n\n" + block + "\n";
  }
  if (start !== -1 && end !== -1 && end > start) {
    return existing.slice(0, start) + block + existing.slice(end + END.length);
  }
  return existing.trimEnd() ? existing.trimEnd() + "\n\n" + block + "\n" : block + "\n";
}

function installRules(projectRoot, installedFiles) {
  const rulesFile = path.join(__dirname, "rules", "CLAUDE.md");
  if (!fs.existsSync(rulesFile)) return;
  const teamRules = fs.readFileSync(rulesFile, "utf8");
  // Guard against sentinel-injection: refuse rules content that itself carries markers.
  if (teamRules.includes(BEGIN) || teamRules.includes(END)) {
    console.warn(`${PACKAGE_NAME}: rules payload contains sentinel markers — skipping rules injection.`);
    return;
  }
  const target = path.join(projectRoot, "CLAUDE.md");
  const existing = fs.existsSync(target) ? fs.readFileSync(target, "utf8") : "";
  fs.writeFileSync(target, applyRulesBlock(existing, teamRules));
  installedFiles.push("CLAUDE.md");
}

function writeManifest(projectRoot, installedFiles) {
  const manifestDir = path.join(projectRoot, ".claude");
  fs.mkdirSync(manifestDir, { recursive: true });
  fs.writeFileSync(
    path.join(manifestDir, MANIFEST),
    JSON.stringify(
      { package: PACKAGE_NAME, version: PACKAGE_VERSION, installedAt: new Date().toISOString(), files: installedFiles },
      null,
      2,
    ) + "\n",
  );
}

function main() {
  // Guard: when this package's OWN deps are installed (npm install/ci in the source
  // tree), npm runs `postinstall` here too. Skip that — only act as a real consumer
  // postinstall (running from under node_modules) or when invoked explicitly
  // (PROJECT_ROOT set, or via the `unstuck-ai-toolkit` bin).
  const isPostinstall = process.env.npm_lifecycle_event === "postinstall";
  const underNodeModules = __dirname.includes(`${path.sep}node_modules${path.sep}`);
  if (isPostinstall && !underNodeModules && !process.env.PROJECT_ROOT) {
    return;
  }

  const projectRoot = findProjectRoot();
  const installedFiles = [];
  installSkills(projectRoot, installedFiles);
  installRules(projectRoot, installedFiles);
  writeManifest(projectRoot, installedFiles);
  console.log(`${PACKAGE_NAME}: installed ${installedFiles.length} file(s)`);
}

try {
  main();
} catch (error) {
  // Never fail the consumer's `npm install` because of a toolkit hiccup.
  console.warn(`${PACKAGE_NAME}: postinstall warning: ${error.message}`);
}
