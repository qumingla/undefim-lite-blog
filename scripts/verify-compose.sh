#!/bin/sh
# Destructive checks are restricted to a fresh clone and an isolated project.
set -eu
[ "${COMPOSE_SMOKE_TEST:-}" = true ] || { echo 'Set COMPOSE_SMOKE_TEST=true for isolated Docker QA'; exit 1; }
source_repo=$(pwd)
temp=$(mktemp -d /tmp/blog-compose-qa.XXXXXX)
repo=$temp/source
project=blog-compose-qa-$(date +%s)-$$
export BLOG_REPO_DIR=$repo COMPOSE_PROJECT_NAME=$project
export BLOG_IMAGE=${QA_BLOG_IMAGE:-undefim-blog:ci} UPDATER_IMAGE=${QA_UPDATER_IMAGE:-undefim-blog-updater:ci}
compose() { docker compose --project-directory "$repo" -f "$repo/compose.yaml" -f "$temp/override.yaml" -p "$project" "$@"; }
cleanup() {
 compose down --timeout 15 >/dev/null 2>&1 || true
 # The updater aligns only this disposable clone's UID with the blog UID.
 docker run --rm --user 0 --entrypoint sh -v "$temp:/qa" "$BLOG_IMAGE" -c 'rm -rf /qa/source' >/dev/null 2>&1 || true
 rm -rf "$temp"
}
trap cleanup EXIT INT TERM
git clone --quiet --no-hardlinks "$source_repo" "$repo"
git -C "$repo" branch -M main
git -C "$repo" remote set-url origin https://github.com/undefim/undefim-lite-blog.git
printf 'services:\n  blog:\n    ports: !reset []\n' > "$temp/override.yaml"
compose up -d --no-build
compose exec -T -e CONTAINER_SMOKE_TEST=true -e EXPECTED_REVISION="$EXPECTED_REVISION" blog node scripts/verify-container.mjs
check_online() {
 compose exec -T blog node --input-type=module -e 'import {createSystemUpdate} from "./server/system-update.mjs";const s=await createSystemUpdate("/app/data").status();if(!s.online||s.config.mode!=="manual")process.exit(1);console.log("执行器在线，默认手动，来源："+s.source.repository);'
}
check_online
# A second process must not become a second updater, even in a new PID namespace.
if compose exec -T --user 1000:1000 updater node --input-type=module -e 'import {acquireWorkerLock} from "./scripts/update-worker.mjs";const release=await acquireWorkerLock(process.cwd());await release();' >/dev/null 2>&1; then
 echo 'Lock incorrectly allowed a second worker'; exit 1
fi
updater_id=$(compose ps -q updater)
docker kill --signal KILL "$updater_id" >/dev/null
# restart:always must recover a killed updater without deleting the lock file.
for attempt in $(seq 1 60); do
 health=$(docker inspect --format '{{.State.Health.Status}}' "$updater_id")
 restarts=$(docker inspect --format '{{.RestartCount}}' "$updater_id")
 if [ "$health" = healthy ] && [ "$restarts" -gt 0 ]; then break; fi
 sleep 2
done
[ "$health" = healthy ] && [ "$restarts" -gt 0 ]
check_online
compose restart --no-deps blog
compose exec -T -e CONTAINER_SMOKE_TEST=true -e EXPECTED_REVISION="$EXPECTED_REVISION" blog node scripts/verify-container.mjs
[ "$(compose ps -q updater)" = "$updater_id" ]
check_online
compose exec -T updater docker compose version
printf '隔离 Compose 验收通过：首次启动、心跳、互斥锁、强杀恢复、仅重启博客与同版本静态入口。\n'
