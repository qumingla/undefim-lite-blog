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
git -c safe.directory="$source_repo" clone --quiet --no-hardlinks "$source_repo" "$repo"
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
# A controlled Git fixture replaces only fetch; Git worktrees, image builds,
# backup, stop/start, revision checks and rollback all use the real Docker engine.
compose exec -T --user 1000:1000 updater sh -c 'git -c user.name=Compose-QA -c user.email=qa@example.invalid -c core.hooksPath=/dev/null commit --allow-empty -m "isolated deployment fixture"' >/dev/null
target=$(compose exec -T --user 1000:1000 updater git rev-parse HEAD)
compose exec -T --user 1000:1000 updater git reset --hard "$EXPECTED_REVISION" >/dev/null
compose exec -T --user 0 -e QA_TARGET="$target" updater sh -s <<'FIXTURE'
set -eu
printf '%s' "$QA_TARGET" > /tmp/blog-qa-target
cat > /usr/local/bin/git <<'GIT'
#!/bin/sh
for arg; do
 if [ "$arg" = fetch ]; then exec /usr/bin/git update-ref refs/remotes/origin/main "$(cat /tmp/blog-qa-target)"; fi
done
exec /usr/bin/git "$@"
GIT
mv /usr/local/bin/docker /usr/local/bin/docker-test-real
cat > /usr/local/bin/docker <<'DOCKER'
#!/bin/sh
for arg; do
 if [ "$arg" = up ] && [ -f /tmp/blog-qa-fail-start ]; then rm /tmp/blog-qa-fail-start; exit 1; fi
done
exec /usr/local/bin/docker-test-real "$@"
DOCKER
chmod 755 /usr/local/bin/git /usr/local/bin/docker
touch /tmp/blog-qa-fail-start
FIXTURE
request() {
 compose exec -T blog node --input-type=module -e 'import {createSystemUpdate} from "./server/system-update.mjs";await createSystemUpdate("/app/data").request();'
}
wait_job() {
 compose exec -T -e QA_STATUS="$1" updater node --input-type=module -e 'import fs from "node:fs/promises";const file=process.env.UPDATE_DATA_DIR+"/system-update/status.json";for(let i=0;i<360;i++){const s=JSON.parse(await fs.readFile(file));if(s.job?.status===process.env.QA_STATUS){if(s.job.status==="failed"&&!s.job.rollback?.startsWith("已恢复"))throw Error("rollback failed");console.log("实际 Docker 更新结果："+s.job.status);process.exit(0)}await new Promise(r=>setTimeout(r,2000))}throw Error("update timeout")'
}
request
wait_job failed
compose exec -T -e CONTAINER_SMOKE_TEST=true -e EXPECTED_REVISION="$EXPECTED_REVISION" blog node scripts/verify-container.mjs
request
wait_job success
compose exec -T blog node -e 'require("fs").unlinkSync("/app/data/.container-smoke-release")'
compose exec -T -e CONTAINER_SMOKE_TEST=true -e EXPECTED_REVISION="$target" blog node scripts/verify-container.mjs
# Successful updates exit and restart the worker so mounted new code is loaded.
for attempt in $(seq 1 60); do
 restarts_after=$(docker inspect --format '{{.RestartCount}}' "$updater_id")
 if [ "$restarts_after" -gt "$restarts" ] && check_online; then break; fi
 sleep 2
done
[ "$restarts_after" -gt "$restarts" ]
compose exec -T updater docker compose version
printf '隔离 Compose 验收通过：启动、心跳、互斥锁、强杀恢复、仅重启博客、真实 Docker 构建/备份/失败回退/成功切换及执行器重载。\n'
