# DOKKAEBI INVENTORY · 1.6.0-beta.9 Release Checklist

마지막 정식 1.6.0 릴리즈 전 수동 점검용 체크리스트입니다.

## 1. 가이드 상태 유지 게이트
- [ ] Home step 진행 중 `/#/logs` 이동 후 `/#/` 복귀 시 step / checklist / coach가 그대로 유지된다.
- [ ] Logs step 진행 중 Home 복귀 후 step 4로 자연스럽게 이어진다.
- [ ] 새로고침 후 session guide runtime이 복구되고 체크리스트가 꼬이지 않는다.
- [ ] 브라우저 뒤로가기/앞으로가기 후 step index와 pending action이 어긋나지 않는다.
- [ ] 수동 `🧭 가이드` 재오픈 후에도 기존 완료 step은 유지되고 review 모드로만 재개된다.

## 2. 완료 / 스킵 정책 게이트
- [ ] completed 이후 skip 버튼이 노출되지 않는다.
- [ ] completed 이후 다시 열면 `복습` 상태로만 열리고 skipped / first-visit로 되돌아가지 않는다.
- [ ] skipped 이후 수동 재실행은 가능하지만 completed 상태를 덮어쓰지 않는다.
- [ ] dismissed 상태는 자동 재오픈되지 않지만 수동 재개는 가능하다.

## 3. 초보자 피드백 게이트
- [ ] 각 step coach 문장만 읽어도 다음 행동을 3초 안에 이해할 수 있다.
- [ ] 현재 대상 UI에 `가이드 대상` 배지, outline, pulse 중 최소 1개가 분명히 보인다.
- [ ] 완료 직후 toast 또는 checklist done 표시가 즉시 보인다.
- [ ] 잘못된 동작 시 coach hint가 “왜 아직 미완료인지” 설명한다.
- [ ] Logs route에서도 checklist가 항상 작은 도크 형태로 보인다.

## 4. 회귀 방지 게이트
- [ ] 일괄 추가는 로그를 생성하지 않는다.
- [ ] 업로드 직전 30분 백업 생성, 복구, TTL 만료 흐름이 정상이다.
- [ ] 로그인 학번은 9자리 제한을 유지한다.
- [ ] 비밀번호 숫자 키패드 UX가 유지된다.
- [ ] 자동 로그아웃 정책 안내는 보이지만 실제 로그아웃 오동작은 없다.
- [ ] 새 기기 첫 동기화 / 느린 네트워크에서도 splash → 부트 동기화 흐름이 자연스럽다.

## 5. 모바일 레이아웃 게이트
- [ ] logs toolbar / guide coach / checklist / toast가 서로 겹치지 않는다.
- [ ] 자동 로그아웃 안내 툴팁이 모바일에서 “길게 누르기 또는 탭” 문구와 함께 읽힌다.
- [ ] guide dock이 하단 safe area를 침범하지 않는다.

## 6. 버전 / 문서 게이트
- [ ] `package.json`, `package-lock.json`, `README.md`, `.welcome.sh` 버전이 모두 `1.6.0-beta.9`로 일치한다.
- [ ] guide storage key / runtime key가 beta.9 기준 문자열로 정리되어 있다.
- [ ] README 변경 이력에 beta.9 안정화 내용이 기록되어 있다.