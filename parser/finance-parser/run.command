#!/bin/bash
# Double-click this file to start the parser.

cd "$(dirname "$0")" || exit 1

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 was not found."
  echo "Run 'xcode-select --install' in Terminal, then try again."
  read -r -p "Press return to close."
  exit 1
fi

MARKER=".venv/.requirements-installed"

if [ ! -d ".venv" ]; then
  echo "First run — setting up. This takes about a minute."
  python3 -m venv .venv || { echo "Could not create the virtualenv."; read -r; exit 1; }
fi

# Install when the marker is missing or requirements.txt has changed since.
if [ ! -f "$MARKER" ] || [ requirements.txt -nt "$MARKER" ]; then
  echo "Installing dependencies…"
  ./.venv/bin/pip install --quiet --upgrade pip
  if ./.venv/bin/pip install --quiet -r requirements.txt; then
    touch "$MARKER"
    echo "Done."
  else
    echo "Dependency install failed. Are you online? The first run needs network access."
    read -r -p "Press return to close."
    exit 1
  fi
fi

./.venv/bin/python app.py

echo
read -r -p "Server stopped. Press return to close."
