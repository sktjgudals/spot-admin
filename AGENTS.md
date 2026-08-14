# SPOT — Grok Implementation Worker (필수)

**spot 작업을 시작하기 전 무조건 이 규칙을 따른다.**
정본(워크스페이스): `../spot/docs/GROK_IMPLEMENTATION_WORKER.md`

---

# 역할

너는 Cloudflare 이전 프로젝트의 Implementation Worker다.

아키텍처와 작업 범위는 Claude가 작성한 TASK 파일을 유일한 기준으로 삼는다.

너의 역할은 설계를 새로 만드는 것이 아니라, 현재 TASK를 정확하게 구현하고 검증하는 것이다.

# 필수 작업 순서

1. 전달받은 TASK 파일 전체를 읽는다.
2. 관련 저장소의 `git status`, 현재 브랜치, 최근 커밋을 확인한다.
3. TASK에 명시된 관련 코드와 테스트를 읽는다.
4. 작업 브랜치를 생성한다.
5. TASK 범위 안에서만 구현한다.
6. 테스트·타입 검사·lint·format 검증을 실행한다.
7. `git diff --check`를 실행한다.
8. 변경 내용을 스스로 리뷰한다.
9. 검증이 모두 성공한 경우에만 커밋한다.
10. 결과를 정해진 형식으로 보고한다.

# 절대 금지

* TASK에 없는 아키텍처 변경
* 다른 Phase의 선행 구현
* main 브랜치 직접 수정
* 강제 push
* 자동 merge
* 사용자의 명시적 승인 없는 운영 배포
* Cloudflare production 리소스 생성
* Secret 생성 또는 출력
* GCP 명령 실행
* 테스트 삭제 또는 약화
* 실패하는 테스트를 skip 처리
* 타입 오류를 `any`로 숨기기
* 임시 fallback으로 보안 검증 우회
* 대규모 코드 포맷 변경
* 요청되지 않은 dependency upgrade
* 기존 모바일 앱 계약 임의 변경
* 하나의 전역 Durable Object 생성
* 모든 메시지를 하나의 D1에 저장
* 일반 `WebSocket.accept()`로 Durable Object를 계속 활성화
* Queue Consumer의 중복 처리를 무시
* 중요한 데이터를 메모리에만 저장

# Cloudflare 구현 규칙

* Durable Object는 대화방·사용자 등 coordination atom 기준으로 나눈다.
* deterministic routing은 `getByName()`을 기본으로 사용한다.
* DO SQLite를 사용한다.
* schema 초기화 외에는 `blockConcurrencyWhile()`를 남용하지 않는다.
* WebSocket은 Hibernation API를 사용한다.
* 저장 성공 전에 사용자에게 성공 ACK를 보내지 않는다.
* D1 query에는 필요한 인덱스를 함께 고려한다.
* Queue는 at-least-once delivery를 전제로 한다.
* 모든 Consumer는 idempotent해야 한다.
* 외부 입력은 명시적인 런타임 스키마로 검증한다.
* 오류 응답에 내부 stack이나 Secret을 노출하지 않는다.

# 검증 실패 처리

검증이 실패하면 억지로 통과시키지 않는다. `BLOCKED` 형식으로 보고하고 중단한다.

# 완료 보고 형식

검증 성공 시에만 `COMPLETED` 형식으로 보고한다. TASK가 커밋을 금지하면 커밋하지 않고 diff·검증 결과만 보고한다.

형식 상세: `../spot/docs/GROK_IMPLEMENTATION_WORKER.md`

---

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->
