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

echo -e "${B}${C4}[1] 프로젝트 목적 (반드시 기억)${R}"
echo -e "  • 단순 동작 앱이 아니라, 부원 실사용 + 후배 인수인계 + 장기 운영 가능한 콘솔"
echo -e "  • 모바일/태블릿 UX를 데스크탑보다 엄격하게 점검"
echo -e ""

echo -e "${B}${C4}[2] 처음 읽을 파일 순서 (초보자 기준)${R}"
echo -e "  1) README.md              : 운영 원칙/릴리즈 규칙/검증 체크리스트"
echo -e "  2) src/App.js             : 핵심 상태/가이드/재고/로그/라우팅"
echo -e "  3) src/App.css            : 반응형/모바일 스크롤/가이드/토스트 레이어"
echo -e "  4) src/LoginPage.js       : 로그인 폼/검증"
echo -e "  5) src/firebase.js        : RTDB 래퍼/디버깅 포인트/TODO"
echo -e "  6) src/utils/backup.js    : 일괄 추가 전 30분 백업/복구"
echo -e "  7) public/index.html      : 스플래시/초기 로딩 단일 소스"
echo -e "  8) package.json           : 버전/스크립트/배포 엔트리"
echo -e ""

echo -e "${B}${C4}[3] 실행 방법${R}"
echo -e "  • 설치:         ${B}npm install${R}"
echo -e "  • 개발 실행:    ${B}npm start${R}"
echo -e "  • 테스트:       ${B}npm test -- --watch=false${R}"
echo -e "  • 빌드 확인:    ${B}npm run build${R}"
echo -e ""

echo -e "${B}${C4}[4] 배포 방법${R}"
echo -e "  • 권장:         ${B}npm run ud -- 1.6.0-beta.3 \"chore(release): v1.6.0-beta.3\"${R}"
echo -e "  • 수동:         ${B}npm run build && npm run deploy${R}"
echo -e ""

echo -e "${B}${C4}[5] 버전 올리는 규칙${R}"
echo -e "  • 현재 단계: ${B}1.6.0-beta.3${R}"
echo -e "  • 사용자 최종 승인 전까지 ${B}정식 1.6.0 금지${R}"
echo -e "  • 버전 표기는 README/package.json/앱 헤더 설명이 서로 일치해야 함"
echo -e ""

echo -e "${B}${C4}[6] 자주 수정하는 파일 역할${R}"
echo -e "  • README.md       : 운영 기준서(코드와 불일치 금지)"
echo -e "  • src/App.js      : 메인 기능/이벤트/상태/라우팅(가장 중요)"
echo -e "  • src/App.css     : 반응형/레이아웃/모바일 안전영역/팝업 z-index"
echo -e "  • src/LoginPage.js: 학번(9자리)/이름/비밀번호 UX"
echo -e "  • src/firebase.js : inventory set / logs push-update-remove 원칙"
echo -e "  • src/utils/backup.js : 업로드 전 30분 백업/복구 안전장치"
echo -e "  • public/index.html: 스플래시 레이아웃 단일 소스"
echo -e "  • package.json    : 버전, 스크립트, 의존성"
echo -e ""

echo -e "${B}${C4}[7] 수정 전/후 체크포인트${R}"
echo -e "  • 수정 전: README와 실제 코드(App.js/App.css) 불일치 여부 확인"
echo -e "  • 수정 후: 로그인 → 홈 → 검색이동 → 로그페이지 → 일괄추가 → 백업복구 동선 점검"
echo -e "  • 가이드: 첫 진입 닫기/스킵 규칙, 단계 유지, 페이지 이동 연속성 확인"
echo -e "  • 모바일: 전체 스크롤, 로그 필터 접힘, 하단 가이드/토스트 겹침 확인"
echo -e ""

echo -e "${B}${C4}[8] 실수하기 쉬운 부분${R}"
echo -e "  • 일괄 추가는 ${B}로그를 생성하지 않음${R} (의도된 설계)"
echo -e "  • 합산 모드에서 같은 파일 재업로드 시 수량이 다시 증가함"
echo -e "  • App.css와 index.html에서 스플래시 레이아웃을 중복으로 건드리면 충돌"
echo -e "  • Firebase 키 금지문자(. # $ / [ ]) 포함 시 저장 실패"
echo -e ""

echo -e "${B}${C4}[9] 운영 중 이상 발생 시 우선 확인${R}"
echo -e "  1) 브라우저 콘솔 경고(Firebase/권한/네트워크/라우팅)"
echo -e "  2) localStorage/sessionStorage 키:"
echo -e "     - do-kkae-bi-has-synced / do-kkae-bi-login-ts"
echo -e "     - do-kkae-bi-onboarding-v1.6.0-beta.3"
echo -e "     - do-kkae-bi-onboarding-runtime-v1"
echo -e "  3) RTDB inventory/logs 경로 데이터 수신 여부"
echo -e ""