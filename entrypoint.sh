#!/bin/bash
set -e

# Configure git credentials if GITHUB_PAT is provided
if [ -n "$GITHUB_PAT" ]; then
  # Configure git to use the PAT for GitHub authentication
  git config --global url."https://${GITHUB_PAT}@github.com/".insteadOf "https://github.com/"

  # Authenticate gh CLI with the PAT
  echo "$GITHUB_PAT" | gh auth login --with-token 2>/dev/null || true
fi

# Configure git user name
if [ -n "$GITHUB_NAME" ]; then
  git config --global user.name "$GITHUB_NAME"
fi

# Configure git user email
if [ -n "$GITHUB_EMAIL" ]; then
  git config --global user.email "$GITHUB_EMAIL"
fi

# Execute the main command
exec "$@"
