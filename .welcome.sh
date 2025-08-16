# --- DOKKAEBI repo welcome banner (sourced by ~/.bashrc) ---
# 비대화형(스크립트)일 때는 조용히 종료
[ -z "$PS1" ] && return 0

# 색상
B='\033[1m'; R='\033[0m'
C1='\033[38;5;87m'   # cyan
C2='\033[38;5;135m'  # purple
C3='\033[38;5;117m'  # blue

# 버전/해시 추출(없으면 빈 값)
PKG="$PWD/package.json"
VER=""
if [ -f "$PKG" ]; then
  VER=$(grep -o '"version"[[:space:]]*:[[:space:]]*"[^"]*"' "$PKG" | sed -E 's/.*"([^"]+)".*/\1/')
fi
GIT=$(git rev-parse --short HEAD 2>/dev/null || echo "-")

echo -e ""
echo -e "${B}${C1}도깨비드론축구단 재고관리 콘솔 코딩작업을 환영합니다!${R}"
[ -n "$VER" ] && echo -e "  ${C3}version:${R} $VER   ${C3}git:${R} $GIT"
echo -e ""
echo -e "  • 업데이트: ${B}npm run ud${R}"
echo -e "    (안되면 권한: ${B}chmod +x scripts/ud${R})"
echo -e "  • 로컬 개발 서버: ${B}npm start${R}"
echo -e "  • 일반 터미널로 여셨다면 ${B}code .${R}를 입력해주세요~"
echo -e ""


# ② (선택) 실행 권한 부여 — 없어도 되지만 깔끔하게
# chmod +x ~/Desktop/dokkaebi-inventory/.welcome.sh
#=====================================================
#새로운 컴퓨터로 옮겼을시 README.👇️
    # =====================================================================
  # DOKKAEBI INVENTORY — 새 컴퓨터 초기 셋업 가이드 (읽기 전용 메모)
  # ---------------------------------------------------------------------
  # [A] 필수 설치
  #   1) Git          : https://git-scm.com/downloads
  #   2) Node.js (권장: LTS)  : nvm 사용 추천
  #        - curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
  #        - source ~/.bashrc   # or ~/.zshrc
  #        - nvm install --lts
  #        - nvm use --lts
  #   3) VS Code(선택) : https://code.visualstudio.com
  #
  # [B] 저장소 가져오기
  #   git clone https://github.com/x2okmiin/dokkaebi-inventory.git ~/Desktop/dokkaebi-inventory
  #   cd ~/Desktop/dokkaebi-inventory
  #
  # [C] 의존성 설치
  #   # package-lock.json이 있으면:
  #   npm ci
  #   # 없거나 오류나면:
  #   npm install
  #
  # [D] 프로젝트 배너(이 파일) 자동 출력 훅 등록 — ~/.bashrc (Bash 기준)
  #   1) 편집:  code -r ~/.bashrc     (또는 nano ~/.bashrc)
  #   2) 맨 아래에 아래 블록 추가 후 저장:
  #        # DOKKAEBI_WELCOME_HOOK
  #        _dokkaebi_welcome_if_repo() {
  #          local TARGET_DIR="$HOME/Desktop/dokkaebi-inventory"
  #          if [[ "${_DOKKAEBI_LAST_PWD:-}" != "$PWD" ]]; then
  #            _DOKKAEBI_LAST_PWD="$PWD"
  #            if [[ -d "$TARGET_DIR" && "$PWD" == "$TARGET_DIR" && -f "$TARGET_DIR/.welcome.sh" ]]; then
  #              source "$TARGET_DIR/.welcome.sh"
  #            fi
  #          fi
  #        }
  #        _dokkaebi_welcome_if_repo
  #        if [[ -z "${PROMPT_COMMAND:-}" ]]; then
  #          PROMPT_COMMAND=_dokkaebi_welcome_if_repo
  #        else
  #          PROMPT_COMMAND="_dokkaebi_welcome_if_repo; $PROMPT_COMMAND"
  #        fi
  #   3) 적용:  source ~/.bashrc
  #   * Zsh를 쓰면 ~/.zshrc에 precmd 훅으로 등록:
  #        precmd_functions+=(_dokkaebi_welcome_if_repo)
  #
  # [E] 배포/업데이트 파이프라인
  #   - 스크립트 권한:   chmod +x scripts/ud
  #   - 업데이트 실행:   npm run ud -- 1.2.3  "release: 1.2.3"
  #       · 동일 태그(v1.2.3) 존재 시 중단
  #       · 빌드 후 gh-pages로 배포
  #   - 결과 접속:      https://x2okmiin.github.io/dokkaebi-inventory/#/
  #
  # [F] GitHub 권한 이슈 해결(gh-pages push 실패 시)
  #   - HTTPS 인증 팝업/토큰 필요: https://github.com/settings/tokens (repo 권한)
  #   - 또는 SSH 권장:
  #       ssh-keygen -t ed25519 -C "you@example.com"
  #       eval "$(ssh-agent -s)"
  #       ssh-add ~/.ssh/id_ed25519
  #       # 공개키 내용을 GitHub > Settings > SSH and GPG keys에 등록
  #       cat ~/.ssh/id_ed25519.pub
  #       git remote set-url origin git@github.com:x2okmiin/dokkaebi-inventory.git
  #
  # [G] Firebase 관련(필요 시)
  #   - src/firebase.js가 이미 커밋되어 있어야 함(키가 공개 사용 가능 설정일 것).
  #   - Realtime Database 규칙/권한 문제로 쓰기 실패 시:
  #       · 콘솔에서 rules 확인, 또는 테스트 허용 범위 조정
  #   - 네트워크 차단 환경이면 실시간 동기화 지연/실패 가능
  #
  # [H] 로컬 개발
  #   npm start
  #
  # [I] 자주 쓰는 복구 명령
  #   - 의존성 초기화:      rm -rf node_modules package-lock.json && npm ci
  #   - 원격 갱신:          git pull --rebase
  #   - 캐시성 빌드 오류:   rm -rf build && npm run build
  #
  # [J] 프로젝트 위치 변경 시
  #   - 이 파일(.welcome.sh)은 프로젝트 루트에 두고,
  #   - ~/.bashrc 훅의 TARGET_DIR 경로만 새 위치로 바꿔주면 됨.
  # =====================================================================


  # --- 실제 배너 출력 로직 (수정 가능)👇️ ----------------------------------
    # 비대화형(스크립트) 셸이면 조용히 종료
     #[ -z "$PS1" ] && return 0

    # 색상
          #B='\033[1m'; R='\033[0m'
          #C1='\033[38;5;87m'   # cyan
          #C2='\033[38;5;135m'  # purple
          #C3='\033[38;5;117m'  # blue

    # package.json에서 버전 읽기(없으면 공백)
              #PKG="$PWD/package.json"
              #VER=""
              #if [ -f "$PKG" ]; then
              #  VER=$(grep -o '"version"[[:space:]]*:[[:space:]]*"[^"]*"' "$PKG" | sed -E 's/.*"([^"]+)".*/\1/')
              #fi
              #GIT=$(git rev-parse --short HEAD 2>/dev/null || echo "-")

              #echo -e ""
              #echo -e "${B}${C1}도깨비드론축구단 재고관리 콘솔 코딩하러 오신걸 환영합니다!${R}"
              #[ -n "$VER" ] && echo -e "  ${C3}version:${R} $VER   ${C3}git:${R} $GIT"
              #echo -e ""
              #echo -e "  • 업데이트: ${B}npm run ud${R}   (안되면 권한: ${B}chmod +x scripts/ud${R})"
              #echo -e "  • 로컬 실행: ${B}npm start${R}"
              #echo -e ""
