#!/usr/bin/env node

// Uninstaller for @lukasz-rdzanek/unstuck-ai-toolkit (M5L4).
// Reads the manifest and removes exactly what install.js added — independent of
// node_modules (package-manager uninstall hooks aren't reliable). Strips the
// sentinel block from CLAUDE.md but leaves any of the user's own edits intact.

const fs = require("node:fs");
const path = require("node:path");

const PACKAGE_NAME = "@lukasz-rdzanek/unstuck-ai-toolkit";
const BEGIN = `<!-- BEGIN ${PACKAGE_NAME} -->`;
const END = `<!-- END ${PACKAGE_NAME} -->`;
const MANIFEST = ".unstuck-ai-toolkit-manifest.json";

function removeRulesBlock(content) {
  const start = content.indexOf(BEGIN);
  const end = content.indexOf(END);
  if (start === -1 || end === -1 || end < start) return content;
  return (content.slice(0, start) + content.slice(end + END.length)).replace(/\n{3,}/g, "\n\n");
}

function main() {
  const projectRoot = process.env.PROJECT_ROOT || process.cwd();
  const manifestPath = path.join(projectRoot, ".claude", MANIFEST);
  if (!fs.existsSync(manifestPath)) {
    console.log(`${PACKAGE_NAME}: no manifest found, nothing to uninstall`);
    return;
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  for (const relPath of manifest.files || []) {
    if (relPath === "CLAUDE.md") continue; // handled via sentinel strip below
    fs.rmSync(path.join(projectRoot, relPath), { recursive: true, force: true });
  }
  const rulesPath = path.join(projectRoot, "CLAUDE.md");
  if (fs.existsSync(rulesPath)) {
    fs.writeFileSync(rulesPath, removeRulesBlock(fs.readFileSync(rulesPath, "utf8")));
  }
  fs.rmSync(manifestPath, { force: true });
  console.log(`${PACKAGE_NAME}: uninstalled managed files`);
}

main();
