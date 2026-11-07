#!/bin/sh
# Render entrypoint: keep WhatsApp session + mutable JSON state on the persistent disk.
set -e

APP_DIR="/app"
DATA_DIR="$APP_DIR/auth_info/data"
mkdir -p "$DATA_DIR"

# 1) Files that ship with the image: copy them to the disk on first boot, then symlink.
for f in "$APP_DIR"/*.json; do
  [ -e "$f" ] || continue
  base=$(basename "$f")
  case "$base" in
    package.json|package-lock.json|tsconfig.json) continue ;;
  esac
  [ -L "$f" ] && continue
  [ -f "$f" ] || continue
  target="$DATA_DIR/$base"
  if [ ! -e "$target" ]; then
    cp -f "$f" "$target" 2>/dev/null || :
  fi
  rm -f "$f"
  ln -s "$target" "$f"
done

# 2) Runtime files that may not exist in the image yet — point them at the disk too.
for base in \
  bot-store.json lid-map.json status-views.json \
  site-meta.json site-chat.json site-accounts.json site-status.json \
  jobs-store.json gallery-queue.json tag-broadcast.json \
  ads-config.json ads-state.json video-relay.json video-approvals.json \
  all-chats.json tg-users.json tg-points.json tg-gallery.json tg-voice.json \
  me-config.json; do
  rm -f "$APP_DIR/$base"
  ln -s "$DATA_DIR/$base" "$APP_DIR/$base"
done

mkdir -p "$DATA_DIR/media"
[ -e "$APP_DIR/site/media" ] || ln -s "$DATA_DIR/media" "$APP_DIR/site/media" 2>/dev/null || true

# yt-dlp מתעדכן לעיתים קרובות בגלל שינויי YouTube — נעדכן בעלייה
pip3 install -U --no-cache-dir --break-system-packages yt-dlp >/dev/null 2>&1 || true

echo "🚀 Render start: data dir = $DATA_DIR"
exec node index.js
