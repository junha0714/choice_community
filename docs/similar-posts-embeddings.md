# Similar posts (Phase 2): OpenAI embeddings 설계 메모

## 목표
- 1단계(MVP) 태그/키워드 기반 추천을 유지하면서 **정확도**를 올린다.
- 운영/비용/성능을 통제 가능한 방식으로 임베딩을 도입한다.

## 권장 아키텍처 (Hybrid)
1) **후보 생성**: 현재 구현된 방식(태그 겹침/카테고리)으로 상위 \(N=100\)개 후보를 뽑음\n+2) **재랭크**: 후보에 대해서만 임베딩 코사인 유사도로 재정렬\n+\n+장점: DB/인프라가 단순하고, 비용이 예측 가능하며, 태그 없는 글도 커버 가능.

## 데이터 모델 제안
- 테이블: `post_embeddings`\n+  - `post_id` (PK/FK)\n+  - `model` (예: `text-embedding-3-small`)\n+  - `content_hash` (title+content+options+tags 정규화 후 해시)\n+  - `embedding` (vector)\n+  - `created_at`, `updated_at`\n+\n+저장은 Postgres라면 `pgvector` 사용을 권장.

## 임베딩 대상(권장)
임베딩 텍스트 = 아래를 합친 “결정 맥락” 문자열\n+- `title`\n+- `content`\n+- `options`\n+- `category`\n+- `tags` (있으면)\n+\n+정규화:\n+- 공백 정리, 너무 긴 본문은 앞/뒤 요약(또는 max chars 제한)\n+- tags는 소문자/정렬\n+
## 생성 시점
- 글 생성/수정 시 **비동기**로 생성(요청 응답을 막지 않음)\n+  - 큐/백그라운드 워커가 없으면 1차는 “요청 시 lazy 생성 + 캐시”도 가능\n+- `content_hash`가 동일하면 재생성 생략

## 비용/속도 전략
- 모델: `text-embedding-3-small`부터 시작(저렴, 충분히 좋음)\n+- 캐시: `post_id` 단위 저장 + `content_hash`로 무효화\n+- 쿼리 빈도 높은 글(조회 많은 글)부터 우선 생성하는 배치 가능

## 엔드포인트 확장안
- 현재: `GET /posts/{id}/similar` (태그/카테고리)\n+- 2단계: `GET /posts/{id}/similar` 내부에서\n+  - 후보 생성 → 임베딩 재랭크를 적용\n+  - 응답은 동일한 `SimilarPostBrief[]` 유지(프론트 변경 최소화)\n+
## 운영 체크리스트
- OpenAI 키 누락/에러 시 fallback(태그 기반만)\n+- 임베딩 테이블 크기/인덱스 관리\n+- 삭제/숨김/차단 규칙은 반드시 후보 생성 단계에서 적용\n*** End Patch}php to=functions.ApplyPatch commentray code_block ,一本道 code:  વસjson to=functions.ApplyPatch  天天送钱extracomment code: 不中反 code: 59816}    კიდევ code: 0})}the code above? Wait applypatch requires freeform not JSON. We'll provide proper patch.">*</commentary to=functions.ApplyPatch>-->
