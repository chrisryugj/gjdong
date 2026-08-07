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

node_modules/.bin/tsx scripts/collect-jeju.ts

BLOB=$(git hash-object -w out-data-jeju/jeju.json)
TREE=$(printf '100644 blob %s\tjeju.json\n' "$BLOB" | git mktree)
COMMIT=$(git commit-tree "$TREE" -m "chore: jeju snapshot $(date '+%Y-%m-%d %H:%M')")
git push -f origin "$COMMIT:refs/heads/data-jeju"

echo "발행 완료 $COMMIT"
