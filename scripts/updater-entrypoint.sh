#!/bin/sh
set -eu
repo=${UPDATE_REPO_DIR:?Missing UPDATE_REPO_DIR}
cd "$repo"
test -d .git && test ! -L .git
test -S /var/run/docker.sock
# This is a dedicated deployment clone. Align source ownership with the blog
# UID, excluding all existing production data and avoiding symlink traversal.
find "$repo" -path "$repo/data" -prune -o -exec chown -h 1000:1000 {} +
if [ ! -e "$repo/data/blog.sqlite" ]; then
 mkdir -p "$repo/data"
 chown 1000:1000 "$repo/data"
 chmod 700 "$repo/data"
fi
mkdir -p "$HOME"
chown 1000:1000 "$HOME"
socket_gid=$(stat -c %g /var/run/docker.sock)
exec setpriv --reuid=1000 --regid=1000 --groups="$socket_gid" --inh-caps=-all node scripts/update-worker.mjs
