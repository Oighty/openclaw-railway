#!/bin/bash
set -e

# Ensure HOME is set; git config --global writes to $HOME/.gitconfig
export HOME="${HOME:-/root}"

# Configure git credentials if GITHUB_PAT is provided.
# This must be best-effort: the container should still start even if git/gh config fails.
if [ -n "$GITHUB_PAT" ]; then
  # Configure git to use the PAT for GitHub authentication
  git config --global url."https://${GITHUB_PAT}@github.com/".insteadOf "https://github.com/" || true

  # Authenticate gh CLI with the PAT
  echo "$GITHUB_PAT" | gh auth login --with-token 2>/dev/null || true
fi

# Configure git user name
if [ -n "$GITHUB_NAME" ]; then
  git config --global user.name "$GITHUB_NAME" || true
fi

# Configure git user email
if [ -n "$GITHUB_EMAIL" ]; then
  git config --global user.email "$GITHUB_EMAIL" || true
fi

# Execute the main command
exec "$@"
