#!/bin/bash
set -e

# Ensure HOME is set; gh/git config writes to $HOME.
export HOME="${HOME:-/root}"

# Configure GitHub auth.
# Prefer GH_TOKEN for non-interactive environments (GitHub CLI supports it natively).
# Back-compat: if only GITHUB_PAT is set, map it to GH_TOKEN.
# Best-effort: the container should still start even if auth config fails.
if [ -n "$GITHUB_PAT" ] && [ -z "$GH_TOKEN" ]; then
  export GH_TOKEN="$GITHUB_PAT"
fi

# If GH_TOKEN is set, gh can authenticate without writing any local credentials.
# Still set up git to use gh as a credential helper (useful for git https remotes).
if [ -n "$GH_TOKEN" ]; then
  gh auth setup-git --hostname github.com 2>/dev/null || true
fi

# Configure git user name
if [ -n "$GITHUB_NAME" ]; then
  git config --global user.name "$GITHUB_NAME" || true
fi

# Configure git user email
if [ -n "$GITHUB_EMAIL" ]; then
  git config --global user.email "$GITHUB_EMAIL" || true
fi

# QMD: initialize a markdown collection for this workspace (best-effort)
# This enables fast local keyword search without expanding context.
if command -v qmd >/dev/null 2>&1; then
  qmd collection add /data/workspace --name workspace --mask "**/*.md" 2>/dev/null || true
  qmd context add qmd://workspace "OpenClaw workspace notes, memory, docs, and project files" 2>/dev/null || true
fi

# Execute the main command
exec "$@"
