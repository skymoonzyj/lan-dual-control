#!/usr/bin/env bash
set -u

root_dir="$(cd "$(dirname "$0")" && pwd)"
cd "$root_dir" || exit 1

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js was not found. Install Node.js, then run this file again."
  if [ -t 0 ]; then
    printf "Press Return to close this window..."
    read -r _
  fi
  exit 127
fi

echo "Opening the local Mac control page for Windows."
echo "This only starts or reuses the browser page; it does not connect, authenticate, or send input."
echo

node scripts/mac/start-mac-client.mjs --allowExisting --open "$@"
exit_code=$?

if [ "$exit_code" -ne 0 ]; then
  echo
  echo "Mac control Windows entry failed with exit code $exit_code."
  echo "Try: node scripts/mac/start-mac-client.mjs --status --boardSummary"
fi

if [ -t 0 ]; then
  echo
  printf "Press Return to close this window..."
  read -r _
fi

exit "$exit_code"
