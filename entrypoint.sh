#!/bin/bash
set -e

# Ensure HOME is set; gh/git config writes to $HOME.
export HOME="${HOME:-/root}"

# Configure GitHub auth if GITHUB_PAT is provided.
# Prefer GitHub CLI's credential helper over embedding a token in a URL rewrite.
# Best-effort: the container should still start even if auth config fails.
if [ -n "$GITHUB_PAT" ]; then
  # Many gh commands will also accept GH_TOKEN directly.
  # Set it so gh can authenticate even if its local keychain/config isn't initialized yet.
  export GH_TOKEN="${GH_TOKEN:-$GITHUB_PAT}"

  # Login for GitHub CLI (stores auth under $HOME/.config/gh)
  printf "%s" "$GITHUB_PAT" | gh auth login --hostname github.com --with-token 2>/dev/null || true

  # Configure git to use gh as a credential helper for github.com
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
