# 시드 데이터 — 업체 7곳 / 파티 50개

마지막 갱신: 2026-08-15

앱과 어드민을 비어 있지 않은 상태로 검증하기 위한 시드 데이터와 등록 스크립트를 기록한다.

| 항목          | 위치                                     |
| ------------- | ---------------------------------------- |
| 데이터        | `scripts/seed-data/dopa-market-seed.mjs`  |
| 등록 스크립트 | `scripts/seed-parties.mjs`                |
| 이미지 생성   | `scripts/generate-seed-images.mjs` + `scripts/seed-images/build-images.py` |
| 검증          | `scripts/test-seed-parties.mjs` (`npm run test:release`에 포함) |
| 로컬 원장     | `scripts/seed-data/.seed-state.<env>.json` (gitignore) |
| 생성 이미지   | `scripts/seed-data/images/` (gitignore)   |

## 실행

```bash
node scripts/generate-seed-images.mjs
node scripts/seed-parties.mjs --env staging
```

인자 없이 돌리면 등록될 업체·파티·가격·일정을 출력만 하는 dry-run이다. 실제 등록은 `--apply`가 있을 때만 일어난다.

```bash
export DOPA_SEED_EMAIL='<SUPER_ADMIN 이메일>'
read -rs DOPA_SEED_PASSWORD && export DOPA_SEED_PASSWORD
node scripts/seed-parties.mjs --env staging --apply
```

production은 승인 문자열을 함께 넘겨야 한다. `cf:deploy:staging`의 `DOPA_ADMIN_STAGING_DEPLOY_ACK`와 같은 규칙이다.

```bash
node scripts/seed-parties.mjs --env production --apply --ack I_ACKNOWLEDGE_PRODUCTION_SEED
```

| 옵션               | 설명                                                       |
| ------------------ | ---------------------------------------------------------- |
| `--env <환경>`     | `staging` 또는 `production` (필수)                          |
| `--apply`          | 실제 등록. 없으면 dry-run                                   |
| `--ack <문자열>`   | production `--apply`에만 필요                               |
| `--status <상태>`  | 생성 후 전이할 상태. `RECRUITING`(기본) 또는 `DRAFT`         |
| `--images <모드>`  | `auto`(기본) 공개 주소가 있는 환경에서만 커버 이미지 첨부, `off` 이미지 없이 |
| `--limit <n>`      | 앞에서 n개만 등록 (staging 연습용)                          |

계정은 `DOPA_SEED_EMAIL` / `DOPA_SEED_PASSWORD` 환경변수로만 받는다. 인자로 받으면 셸 히스토리와 `ps` 출력에 비밀번호가 남는다.

## 등록되는 것

**카테고리 4종** — `솔로파티`, `로테이션 소개팅`, `혼술바`, `게스트하우스 파티`. 이름은 앱의 폴백 목록(`home_page.dart`, `party_filter_applier.dart`)과 정확히 같아야 하고, 테스트가 이를 강제한다. 이미 있으면 만들지 않는다.

**업체 7곳**

| 업체 | 유형 | 참가 방식 | 파티 |
| --- | --- | --- | --- |
| 솔로살롱 | 솔로파티 | 승인제 | 8 |
| 싱글스테이지 | 솔로파티 | 즉시참가 | 7 |
| 로테이트서울 | 로테이션 소개팅 | 즉시참가 | 8 |
| 텐미닛서울 | 로테이션 소개팅 | 승인제 | 7 |
| 프라임소셜 | 프리미엄 소셜 | 승인제 | 8 |
| 한잔의밤 | 혼술바 | 즉시참가 | 7 |
| 게하나이트 | 게스트하우스 파티 | 승인제 | 5 |

**파티 50개** — 각 파티마다 제목, 설명(회차 소개 + 진행 순서 + 유의사항), 시작·종료·신청 마감 시각, 장소명·주소·좌표, 정원과 남녀 정원, 성비, 남녀 참가비, 참가 방식, 연령 범위, 관심 표현 한도, 포함 사항, FAQ가 들어간다. 지역은 서울(강남·홍대·건대·성수·여의도·을지로·잠실), 경기 판교, 부산, 대전, 광주, 강원 강릉·양양, 제주에 분포한다.

## 승인파티를 카테고리로 만들지 않은 이유

"승인파티"는 파티 유형이 아니라 `admissionMode: 'APPROVAL'`이라는 별도 축이다. 솔로파티도 로테이션 소개팅도 승인제일 수 있어서, 카테고리로 만들면 파티유형 필터에서 서로를 배제해 버린다. 그래서 승인제는 업체 성격(솔로살롱·텐미닛서울·프라임소셜)과 파티의 `admissionMode`로 표현했다. 50개 중 승인제는 28개, 즉시참가는 22개다.

## 가격과 규모의 근거

국내 솔로파티·로테이션 소개팅 시장을 조사해 맞춘 값이다.

- 로테이션 소개팅은 남녀 4:4~20:20 규모에 1인당 10~15분 대화가 표준이고, 참가비는 남성 3만원 안팎에 여성이 그 절반 수준이다. ([나무위키](https://namu.wiki/w/%EB%A1%9C%ED%85%8C%EC%9D%B4%EC%85%98%20%EC%86%8C%EA%B0%9C%ED%8C%85), [블라인드 후기](https://www.teamblind.com/kr/post/%EB%A1%9C%ED%85%8C%EC%9D%B4%EC%85%98-%EC%86%8C%EA%B0%9C%ED%8C%85-%ED%9B%84%EA%B8%B0%EB%82%A8Ver-JtYPr3Vy))
- 외모·프로필 승인제 솔로파티가 실제로 운영되고 있어 승인제를 기본값으로 둔 업체를 구성했다. ([설레임파티](https://www.threads.com/@seolleimparty), [모드파티](https://www.modparty.co.kr/single_party))
- 인증을 거친 직장인 대상 와인·다이닝 파티는 5만원대 중반 이상이다. 프라임소셜 회차를 55,000~69,000원으로 잡은 근거다. ([문토](https://www.munto.kr/detail-socialing?id=371230), [온오프믹스](https://m.onoffmix.com/event/270015))
- 대화 중심 소셜 모임은 훨씬 저렴하다. 한잔의밤을 16,000~19,000원대로 둔 근거다. ([연플레이스](https://yeonplace.imweb.me/main))

**업체명·연락처·이메일·사업자번호는 전부 가상값이다.** 실존 업체의 이름으로 그 업체가 열지 않은 파티와 가격이 앱에 뜨는 상황을 만들지 않기 위해서다. 연락처는 `0507-0000-00XX`, 사업자번호는 `000-00-000XX`, 이메일은 `.example.com` 도메인으로 명백한 placeholder 형태를 유지한다.

## 스크립트가 다루는 두 가지 비동기 특성

**Admin v2의 GET은 전부 프로젝션을 읽는다.** `DB_ADMIN_00` read model이 `dopa-admin-projection` 큐로 갱신되므로, 방금 만든 업체·파티가 목록 조회에 바로 나타나지 않는다. 그래서 중복 방지를 서버 조회에 맡기지 않고 로컬 원장 파일에 기록한다.

> 원장 파일을 지우고 다시 `--apply`를 돌리면 같은 데이터가 중복 등록된다. 재실행 전에 `scripts/seed-data/.seed-state.<env>.json`이 남아 있는지 확인한다.

**파티 상태 전이도 같은 프로젝션을 읽는다.** 생성 직후 `POST /admin/v2/parties/:id/transitions`를 호출하면 404가 난다. 스크립트는 404를 실패가 아니라 "프로젝션이 아직 따라오지 않았다"로 보고 최대 8회, 백오프를 늘려가며 재시도한다. 그래도 실패하면 해당 파티는 `DRAFT`로 남고 로그에 `모집 전환 보류`로 표시된다.

`DRAFT` 파티는 앱 검색·홈에 노출되지 않는다. 보류된 파티는 잠시 뒤 어드민에서 직접 모집 상태로 바꾸거나, 스크립트를 다시 돌리면 된다(이미 만든 파티는 원장 덕에 건너뛴다).

## 되돌리기

파티는 삭제 API가 없다. 되돌리려면 각 파티를 `CANCELLED`로 전이하고 업체는 `POST /admin/v2/businesses/:id/disable`로 비활성화한다. 50건을 되돌리는 비용이 만드는 비용보다 크기 때문에, 스크립트의 기본값이 dry-run이고 production에는 승인 문자열을 요구한다.

## 커버 이미지

`node scripts/generate-seed-images.mjs`가 파티 50개의 커버 이미지를 `scripts/seed-data/images/`에 만든다. 1200×800 JPEG, 장당 70KB 안팎, 전체 3.6MB. 카테고리별 색과 파티 정보(제목·지역·장소·정원·남녀 참가비·참가 방식·업체명)를 얹은 타이포그래피 카드다.

웹에서 사진을 가져오지 않고 직접 그린다. 남의 사진에는 저작권과 초상권이 붙고, 시드 이미지는 실서비스 파티 카드에 그대로 노출된다. 렌더링은 Pillow(`scripts/seed-images/build-images.py`)가 맡는다 — 이 맥에 설치된 래스터라이저가 그것뿐이다. 이미지는 gitignore 대상이고, 필요하면 스크립트로 언제든 동일하게 다시 만든다.

### 업로드 경로가 API가 아닌 이유

SUPER_ADMIN에게는 파티 이미지 업로드 API가 없다. 티켓을 발급하는 `POST /businesses/me/parties/media-upload-url`은 `requireMyBusinessAdmin()` 뒤에 있어서 역할이 `ADMIN`이고 업체가 배정된 운영자만 통과하고, 업체 id도 경로가 아니라 그 배정에서 나온다.

그래서 시드는 wrangler로 R2에 직접 올리고 파티에는 공개 URL만 넘긴다. `partyFields`의 `coverImage`·`images`는 URL 형식만 검사하므로 유효한 경로다. 오브젝트 키는 어드민 업로더와 같은 규칙에 시드 표시를 더한 `parties/{businessId}/seed-{slug}.jpg`다.

이 경로는 `wrangler`가 해당 Cloudflare 계정으로 로그인되어 있어야 하고, R2 쓰기는 별도 승인이 필요할 수 있다.

### 환경별 상태

| 환경 | 버킷 | 공개 주소 |
| --- | --- | --- |
| production | `dopa-media` | `media.dopa.ing` |
| staging | `dopa-media-staging` | `media-staging.dopa.ing` |

staging 도메인은 이 시드를 위해 연결했다. 그전에는 커스텀 도메인도 r2.dev 공개 접근도 없어서 올려도 앱·브라우저가 읽지 못했다.

```bash
wrangler r2 bucket domain add dopa-media-staging \
  --domain media-staging.dopa.ing --zone-id 44a179e829bc1c886054ca43cc826a5f --min-tls 1.2
```

두 도메인 모두 Cloudflare 엣지 캐시를 거친다. 같은 키에 다시 올려도 잠시 옛 이미지가 나올 수 있다. 시드는 매번 새 키를 쓰므로 문제가 되지 않지만, 수동으로 덮어쓸 때는 캐시를 감안한다.

### 남은 설정 (시드 범위 밖)

staging 워커에는 `R2_PUBLIC_BASE_URL`이 여전히 비어 있다. 시드는 자체적으로 공개 주소를 알고 있어 영향이 없지만, **어드민 UI의 이미지 업로더는 staging에서 503으로 실패한다** — `publicBaseFor`가 production 외의 환경에서는 이 값을 요구하기 때문이다. 고치려면 staging 워커에 `R2_PUBLIC_BASE_URL=https://media-staging.dopa.ing`을 넣고 백엔드를 배포해야 한다.
