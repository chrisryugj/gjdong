#!/bin/bash
# 제주 스냅샷 수집 → data-jeju 브랜치 발행 (맥미니 LaunchAgent가 15분마다 실행)
#
# 브랜치를 체크아웃하지 않고 commit-tree 로 부모 없는 커밋을 만들어 강제 푸시한다.
# 이유 둘: ①작업 중인 main 워킹트리를 절대 건드리지 않는다 ②히스토리가 쌓이지 않아
# 15분마다 도는데도 레포가 커지지 않는다(히트맵의 force_orphan 과 같은 효과).
#
# data 브랜치(히트맵)와 분리한 이유: 그쪽은 force_orphan 으로 브랜치를 통째 교체해서
# 같이 두면 서로의 파일을 지운다.
set -euo pipefail

cd "$(dirname "$0")/.."
export PATH="/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"

# 수집 실패가 조용히 계속되는 것을 막는다 — 2026-08-09 원천 403 잠김을 9일간
# 아무도 몰랐다. 실패가 이어지면 하루 한 번 텔레그램으로 알린다.
alert_once_a_day() {
  local stamp="$HOME/.local/state/gjdong-jeju-alert.stamp" now last
  mkdir -p "$(dirname "$stamp")"
  now=$(date +%s); last=$(cat "$stamp" 2>/dev/null || echo 0)
  (( now - last < 86400 )) && return 0
  echo "$now" > "$stamp"
  local env_file="$HOME/.hermes/.env" token chat
  [[ -f "$env_file" ]] || return 0
  token=$(grep -m1 '^TELEGRAM_BOT_TOKEN=' "$env_file" | cut -d= -f2- | tr -d "'\" ")
  chat=$(grep -m1 '^TELEGRAM_HOME_CHANNEL=' "$env_file" | cut -d= -f2- | tr -d "'\" ")
  [[ -n "$token" && -n "$chat" ]] || return 0
  curl -sS -m 20 -o /dev/null -X POST "https://api.telegram.org/bot${token}/sendMessage" \
    --data-urlencode "chat_id=${chat}" \
    --data-urlencode "text=⚠️ 제주 인파 수집 실패가 계속되고 있다.
원천(jeju.mms.gislab.co.kr)이 403으로 잠겨 있으면 /crowd 제주 탭이 옛 데이터로 남는다.
로그: ~/Library/Logs/gjdong-jeju-snapshot.log" 2>/dev/null || true
}

if ! node_modules/.bin/tsx scripts/collect-jeju.ts; then
  alert_once_a_day
  exit 1
fi

# data-jeju 는 JSON만 든 orphan 브랜치라 Vercel이 빌드하면 반드시 실패한다.
# vercel.json 은 "배포되는 커밋의 것"이 적용되므로 발행물 안에 같이 넣어야 막힌다
# (main 의 vercel.json 만으로는 이 브랜치의 푸시를 막지 못한다).
echo '{"git":{"deploymentEnabled":{"data-jeju":false}}}' > out-data-jeju/vercel.json

SNAP=$(git hash-object -w out-data-jeju/jeju.json)
HEAT=$(git hash-object -w out-data-jeju/jeju-heatmap.json)
VCFG=$(git hash-object -w out-data-jeju/vercel.json)
TREE=$(printf '100644 blob %s\tjeju.json\n100644 blob %s\tjeju-heatmap.json\n100644 blob %s\tvercel.json\n' "$SNAP" "$HEAT" "$VCFG" | git mktree)
COMMIT=$(git commit-tree "$TREE" -m "chore: jeju snapshot $(date '+%Y-%m-%d %H:%M')")
git push -f origin "$COMMIT:refs/heads/data-jeju"

echo "발행 완료 $COMMIT"
