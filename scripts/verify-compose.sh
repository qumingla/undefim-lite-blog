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
 result=$?
 if [ "$result" -ne 0 ]; then
  compose logs --tail 40 updater blog >&2 || true
 fi
 compose down --timeout 15 >/dev/null 2>&1 || true
 # The updater aligns only this disposable clone's UID with the blog UID.
 docker run --rm --user 0 --entrypoint sh -v "$temp:/qa" "$BLOG_IMAGE" -c 'rm -rf /qa/source' >/dev/null 2>&1 || true
 rm -rf "$temp"
}
trap cleanup EXIT INT TERM
git -c safe.directory="$source_repo" clone --quiet --no-hardlinks "$source_repo" "$repo"
git -C "$repo" checkout --quiet -B main
git -C "$repo" remote set-url origin https://github.com/undefim/undefim-lite-blog.git
printf 'services:\n  blog:\n    ports: !reset []\n' > "$temp/override.yaml"
compose up -d --no-build
compose exec -T -e CONTAINER_SMOKE_TEST=true -e EXPECTED_REVISION="$EXPECTED_REVISION" blog node scripts/verify-container.mjs
check_online() {
 compose exec -T blog node --input-type=module -e 'import {createSystemUpdate} from "./server/system-update.mjs";const s=await createSystemUpdate("/app/data").status();if(!s.online||s.config.mode!=="manual")process.exit(1);console.log("执行器在线，默认手动，来源："+s.source.repository);'
}
check_online
test "$(docker inspect --format '{{.Config.Image}}' "$(compose ps -q blog)")" = "$BLOG_IMAGE"
# A second process must not become a second updater, even in a new PID namespace.
if compose exec -T --user 1000:1000 updater node --input-type=module -e 'import {acquireWorkerLock} from "./scripts/update-worker.mjs";const release=await acquireWorkerLock(process.cwd());await release();' >/dev/null 2>&1; then
 echo 'Lock incorrectly allowed a second worker'; exit 1
fi
updater_id=$(compose ps -q updater)
compose exec -T --user 1000:1000 updater node -e 'const fs=require("fs");const pid=fs.readdirSync("/proc").filter(x=>/^\d+$/.test(x)).find(x=>{try{return fs.readFileSync("/proc/"+x+"/cmdline","utf8").split("\0")[1]==="scripts/update-worker.mjs"}catch{return false}});if(!pid)process.exit(1);process.kill(Number(pid),"SIGKILL")' || [ "$?" -eq 137 ]
# Kill the process inside the container: Docker kill is an explicit manual stop
# and intentionally suppresses restart policies. Recover without deleting the lock file.
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
printf 'services:\n  blog:\n    ports: !reset []\n' > /tmp/blog-qa-override.yaml
cat > /usr/local/bin/docker <<'DOCKER'
#!/usr/local/bin/node
const fs=require('fs'),{spawnSync}=require('child_process');
const args=process.argv.slice(2);
if(args[0]==='compose'){
 const command=args.findIndex(arg=>['config','ps','build','exec','stop','up'].includes(arg));
 if(command>=0)args.splice(command,0,'-f','/tmp/blog-qa-override.yaml');
}
if(args.includes('up')&&fs.existsSync('/tmp/blog-qa-fail-start')){fs.unlinkSync('/tmp/blog-qa-fail-start');process.exit(1)}
const result=spawnSync('/usr/local/bin/docker-test-real',args,{stdio:'inherit'});
process.exit(result.status??1);
DOCKER
chmod 755 /usr/local/bin/git /usr/local/bin/docker
touch /tmp/blog-qa-fail-start
chown 1000:1000 /tmp/blog-qa-fail-start
FIXTURE
request() {
 compose exec -T blog node --input-type=module -e 'import {createSystemUpdate} from "./server/system-update.mjs";await createSystemUpdate("/app/data").request();'
}
wait_job() {
 for attempt in $(seq 1 360); do
  result=$(compose exec -T updater node -e 'const fs=require("fs");const s=JSON.parse(fs.readFileSync(process.env.UPDATE_DATA_DIR+"/system-update/status.json"));console.log((s.job?.status||"none")+"|"+(s.job?.rollback||"")+"|"+(s.job?.message||""))' 2>/dev/null || true)
  case "$result" in
   "$1|"*)
    if [ "$1" = failed ]; then case "$result" in 'failed|已恢复'*) ;; *) echo "Rollback did not complete: $result"; exit 1;; esac; fi
    echo "实际 Docker 更新结果：$1"; return 0;;
  esac
  sleep 2
 done
 echo 'Update timed out'; exit 1
}
request
wait_job failed
test "$(docker inspect --format '{{.Config.Image}}' "$(compose ps -q blog)")" = "$BLOG_IMAGE"
compose exec -T -e CONTAINER_SMOKE_TEST=true -e EXPECTED_REVISION="$EXPECTED_REVISION" blog node scripts/verify-container.mjs
request
wait_job success
test "$(docker inspect --format '{{.Config.Image}}' "$(compose ps -q blog)")" = "$BLOG_IMAGE"
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
