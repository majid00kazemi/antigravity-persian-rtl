#!/usr/bin/env bash
set -e

REPO_URL="https://github.com/majid00kazemi/antigravity-persian-rtl.git"
TARGET_DIR="$HOME/.gemini/config/plugins/persian-rtl"

echo "Installing Antigravity Persian RTL Plugin..."

if [ -d "$TARGET_DIR/.git" ]; then
    echo "Updating existing plugin..."
    git -C "$TARGET_DIR" pull
elif [ -d "$TARGET_DIR" ]; then
    echo "Backing up existing directory..."
    mv "$TARGET_DIR" "${TARGET_DIR}.bak_$(date +%Y%m%d_%H%M%S)"
    git clone "$REPO_URL" "$TARGET_DIR"
else
    mkdir -p "$(dirname "$TARGET_DIR")"
    git clone "$REPO_URL" "$TARGET_DIR"
fi

echo ""
echo "Plugin installed successfully!"
echo "Next steps:"
echo "1. Open or restart Antigravity."
echo "2. Go to 'Customizations' (left sidebar) -> 'Installed' tab."
echo "3. Toggle 'Persian RTL' to Enabled."
