# --- DOKKAEBI INVENTORY onboarding helper (interactive shells only) ---
[ -z "$PS1" ] && return 0

B='\033[1m'; R='\033[0m'
C1='\033[38;5;87m'
C2='\033[38;5;141m'
C3='\033[38;5;117m'
C4='\033[38;5;179m'

PKG="$PWD/package.json"
VER="-"
if [ -f "$PKG" ]; then
  VER=$(sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$PKG" | head -n1)
  [ -z "$VER" ] && VER="-"
fi
GIT=$(git rev-parse --short HEAD 2>/dev/null || echo "-")

echo -e ""
echo -e "${B}${C1}🛠️  DOKKAEBI/INVENTORY 운영 콘솔 작업 안내${R}"
echo -e "  ${C3}version:${R} ${VER}   ${C3}git:${R} ${GIT}"
echo -e "  ${C2}목적:${R} 강원도립대 드론융합과 도깨비드론축구단 재고/입출고 운영 콘솔 유지보수"
echo -e ""

echo -e "${B}${C4}[1] 어디부터 읽을까? (초보자 순서)${R}"
echo -e "  1) README.md              : 프로젝트 전체 흐름/운영 원칙"
echo -e "  2) src/App.js             : 핵심 화면/동작(재고+로그+동기화)"
echo -e "  3) src/App.css            : 반응형/UX 스타일"
echo -e "  4) src/LoginPage.js       : 로그인 UX"
echo -e "  5) src/firebase.js        : RTDB 래퍼/디버깅 포인트"
echo -e "  6) src/utils/backup.js    : 일괄 추가 전 30분 백업/복구"
echo -e "  7) public/index.html      : 스플래시/초기 부트 화면"
echo -e "  8) package.json           : 버전/스크립트"
echo -e ""

echo -e "${B}${C4}[2] 실행 / 테스트 / 배포${R}"
echo -e "  • 설치:         ${B}npm install${R}"
echo -e "  • 개발 실행:    ${B}npm start${R}"
echo -e "  • 테스트:       ${B}npm test -- --watch=false${R}"
echo -e "  • 배포(버전업): ${B}npm run ud -- 1.6.0-beta.x \"chore(release): v1.6.0-beta.x\"${R}"
echo -e ""

echo -e "${B}${C4}[3] 버전 규칙${R}"
echo -e "  • 지금 단계: ${B}1.6.0-beta.x${R}"
echo -e "  • 사용자 최종 승인 전까지 ${B}정식 1.6.0 금지${R}"
echo -e ""

echo -e "${B}${C4}[4] 자주 수정하는 파일 한 줄 설명${R}"
echo -e "  • README.md       : 운영 문서(코드와 반드시 일치해야 함)"
echo -e "  • src/App.js      : 메인 기능/이벤트/상태/라우팅"
echo -e "  • src/App.css     : 반응형(모바일 우선) + 시각 일관성"
echo -e "  • src/LoginPage.js: 학번/이름/비밀번호 입력 UX"
echo -e "  • src/firebase.js : Firebase API 래퍼 + 추후 최적화 경계"
echo -e "  • src/utils/backup.js : 업로드 전 안전 백업"
echo -e "  • public/index.html: 스플래시/초기 로딩 진입점"
echo -e "  • package.json    : 버전/스크립트/의존성"
echo -e ""

echo -e "${B}${C4}[5] 수정 전/후 체크포인트${R}"
echo -e "  • 수정 전: README와 현재 코드가 서로 같은 설명인지 확인"
echo -e "  • 수정 후: 로그인 → 홈 → 검색이동 → 로그페이지 → 일괄추가 동선 점검"
echo -e "  • 모바일 폭(<=600)에서 로그아웃 버튼/카드 스크롤/필터 UI 확인"
echo -e ""

echo -e "${B}${C4}[6] 실수하기 쉬운 부분${R}"
echo -e "  • 일괄 추가는 ${B}로그를 생성하지 않음${R} (의도된 설계)"
echo -e "  • 같은 파일 재업로드 시 수량이 다시 증가함"
echo -e "  • 스플래시 스타일을 App.css와 index.html 양쪽에서 중복 정의하면 충돌 발생"
echo -e "  • Firebase 키 금지문자(. # $ / [ ]) 포함 시 저장 실패"
echo -e ""

echo -e "${B}${C4}[7] 운영 중 이상 시 우선 확인${R}"
echo -e "  1) 브라우저 콘솔 경고(Firebase/권한/네트워크)"
echo -e "  2) localStorage: do-kkae-bi-has-synced / do-kkae-bi-login-ts / 가이드 상태 키"
echo -e "  3) RTDB inventory/logs 경로에 데이터 수신되는지"
echo -e ""