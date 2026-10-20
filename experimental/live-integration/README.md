# Gacha Forge Customizer — 통합 연동 시험판 (0.3.0-dev)

> **시험 코드이며 운영 서버 설치 금지.** 현재 배포물은 사용자 제공 `server.mjs`에 대한 오프라인 패치와 개인 확장 시안입니다. 실제 서비스 실행·인증·뽑기·배너 회귀 테스트가 완료되지 않았습니다.

## 파일

- `manifest.json` / `extension.js`: 개인 확장 미리보기
- `patch.py`: 원본 `server.mjs`를 읽고 **새 출력 파일만 작성**하는 일치 검증형 패치
- 설정 API: `GET /api/gacha-forge/gf-customizer/settings`, `POST /api/gacha-forge/gf-customizer/settings`

## curl 다운로드 (다운로드 및 문법 검사만)

다음은 서버 원본을 덮어쓰거나 Docker를 재시작하지 않습니다.

```bash
mkdir -p ~/gf-customizer-preview
cd ~/gf-customizer-preview

BASE="https://raw.githubusercontent.com/tlsiddl/gacha-forge-customizer/main/experimental/live-integration"
curl -fL --retry 3 "$BASE/patch.py" -o patch.py
curl -fL --retry 3 "$BASE/manifest.json" -o manifest.json
curl -fL --retry 3 "$BASE/extension.js" -o extension.js

python3 -m py_compile patch.py
node --check extension.js
python3 -m json.tool manifest.json >/dev/null
```

### 서버 원본 복사본으로 오프라인 검사

`/path/to/server.mjs` 부분에 **사용 중인 Gacha Forge의 원본 소스 위치**를 넣어야 합니다. 기존 파일과 정확히 일치하지 않으면 패치는 적용을 중단합니다.

```bash
python3 patch.py /path/to/server.mjs /tmp/gf-customizer-test-server.mjs
node --check /tmp/gf-customizer-test-server.mjs
```

**주의:** `/tmp/gf-customizer-test-server.mjs`은 운영 파일이 아닌 검사 결과입니다. `server.mjs` 교체, 컨테이너 볼륨 마운트, 환경변수 설정 및 서버 재시작은 하지 마세요.

## 이번 시험판 기능

- 새 배너 생성 시 기간(1~30일) 반영 시도
- 캐릭터/무기 5성 천장 별도 지정 시도
- 픽업 5성 확정 옵션
- 풀돌 중복 Glimmer 설정 (별도 신규 재화 없음)
- 서버 공통 설정 파일 영구 저장 API와 관리자 인증키 검증

## 아직 필요한 검증과 구현

- 이미 생성된 배너의 종료 시점은 변경하지 않음
- 정해진 주기에 다음 픽업이 자동 생성되는지 미검증
- 기존 서버 기본값·천장 계산·확률·픽업 실패 상태 보존 회귀 테스트 미완료
- API 라우팅, 파일 쓰기 권한, 인증 방식, 동시성 안전성 실환경 검증 미완료
- 월드별 설정, 서버 패치 자동 적용/제거, 클라이언트 실제 설치 검증 미완료
- 기존 Glimmer를 사용한 4성·5성 정가 상점 **미구현**

설정 변경은 서버 파일 자체를 실시간으로 덮어쓰는 방식이 아니라, 향후 검증된 서버 API를 통해 서버 설정 파일에 저장하는 방식으로 설계했습니다.

[프로젝트 메인](https://github.com/tlsiddl/gacha-forge-customizer)


## 2026-10-20 안전 수정

이전 `gfPity(U,ne,Q,m)` 호출은 **4성·5성 확률 인자를 뒤집는 결함**이 있었습니다. 이번 패치는 `gfPity(U,Q,ne,m)`으로 수정했습니다. 천장을 80으로 설정하면 공식 `MA()` 함수를 그대로 호출하여 기본 확률을 보존합니다. 그 외 사용자 지정 하드 천장에 대한 결정적 테스트를 추가했습니다.

```bash
# GitHub에서 최신 패치 및 테스트를 다시 다운로드한 후 실행
python3 test_rules.py server-original.mjs
```

이 명령은 원본 파일을 읽고 임시 디렉터리에서만 테스트합니다. 문법 검사와 기본/사용자 지정 천장 로직 일부만 검사합니다. **실제 서비스에 적용할 수 있다는 인증은 아닙니다.**

**남은 차단 요소:** 설정 API 권한 모델, 동시 저장 경쟁, 기존 배너/미니 이벤트 주기, 설정 페이지 UX, 데이터 전송 및 저장 안전성, Glimmer 정가 교환을 검증하기 전에는 운영 환경 설치를 금지합니다.

### 추가 오프라인 검증

`test_rules.py`는 Node.js가 호스트에 없어도 현재 실행 중인 Marinara Docker 컨테이너의 Node.js를 이용합니다. 별도 서버 파일과 실제 설정 파일을 수정하지 않고, 코드에서 추출한 설정 유효성 검사·저장 함수에 모의 파일시스템을 연결해 비정상 값 거부, 저장 파일 권한, 저장 실패 시 기존 설정 유지를 검사합니다. **실제 HTTP API 통신과 디스크 저장의 성공 여부를 검증하는 테스트는 아닙니다.**

```bash
cd ~/gf-customizer-preview
curl -fL https://raw.githubusercontent.com/tlsiddl/gacha-forge-customizer/aea98c9b33a78f020877a01784e458e7afab0027/experimental/live-integration/test_rules.py -o test_rules.py
python3 test_rules.py server-original.mjs
```

## 격리 HTTP 계약 검사 (개발 전용)

GitHub의 `test_http_isolated.py`는 **패치본에서 추출한 설정 핸들러를 모의 HTTP 어댑터에 연결**하고 실행 중인 마리나라 컨테이너 안의 Node.js로 `127.0.0.1` 임의 포트에서 GET/POST 요청을 검증합니다. 운영 Gacha Forge 서버의 실제 라우팅·HTTP 상태 코드·인증 프록시·파일 저장 성공을 검사하는 것이 **아닙니다**. 실제 데이터나 패키지 파일을 변경하지 않습니다.

```bash
cd ~/gf-customizer-preview
curl -fL https://raw.githubusercontent.com/tlsiddl/gacha-forge-customizer/9a84d8798d4b27fd389855c6160a4da4c33947d0/experimental/live-integration/test_http_isolated.py -o test_http_isolated.py
python3 test_http_isolated.py server-test.mjs
```

테스트 결과가 통과해도 운영 서버 패치 설치는 금지합니다. **실제 라우팅/권한과 배너 스케줄 동작을 추가로 검증해야 합니다.**

## 배너 교체 함수 회귀 테스트

`test_banner_rotation.py`는 사용자가 제공한 **원본**과 **패치본**에서 `ht()`·`cy()`·`ly()`·`ow()` 함수를 그대로 추출해 Node.js에서 검사합니다. 14일 기본 동작, 7일 설정 변경 이후 신규 배너 기간, 기존 배너 만료일 유지, 만료 경계, 회차 번호 증가, 캐릭터/무기 배너의 일치된 종료일을 확인합니다.

```bash
cd ~/gf-customizer-preview
curl -fL https://raw.githubusercontent.com/tlsiddl/gacha-forge-customizer/01b82f9ea16f6b7c739c3ba6c61255a157909968/experimental/live-integration/test_banner_rotation.py -o test_banner_rotation.py
python3 test_banner_rotation.py server-original.mjs server-test.mjs
```

이 테스트는 원본 패키지나 데이터베이스를 수정하지 않습니다. **`hl()`의 실제 저장 및 스케줄러 자동 호출, 캐릭터/무기 배너의 게임 화면 반영은 검증하지 않습니다.** 또한 기존 배너가 14일로 남아 있는데 설정을 7일로 변경하면 상태 응답의 `days`는 7, 기존 `endsAt`은 원래 값으로 표시될 수 있습니다. 이는 표시 일수의 의미를 재검토해야 할 UI 문제입니다.

## 배너 기간 표시 수정 (2026-10-20)

진행 중인 배너의 `days`는 실제 `startedAt`과 `endsAt`의 차이로 표시하고, 새 배너가 없을 때만 현재 설정값을 사용하도록 수정했습니다. 따라서 기존 14일 배너 도중 7일로 설정을 바꾸어도 기존 배너는 **14일**, 새로 생성한 배너는 **7일**로 표시됩니다.

`hl()`은 가챠 관련 요청에서 호출되는 사실을 원본 코드에서 확인했습니다. 아직 주기적 백그라운드 스케줄러의 존재를 확인하지 못했으므로, 이 기능을 '요청 없이 자동 교체'로 설명하지 않습니다. 원본의 실제 저장 함수 `Pe()`와 배너 문서 갱신 경로는 운영 전 격리 검증이 필요합니다.

기존 `server-test.mjs`는 **이전 패치로 만든 파일**입니다. 아래처럼 최신 `patch.py`로 다시 생성해야 새 테스트와 일치합니다.

```bash
cd ~/gf-customizer-preview
BASE="https://raw.githubusercontent.com/tlsiddl/gacha-forge-customizer/main/experimental/live-integration"
curl -fL "$BASE/patch.py" -o patch.py
curl -fL "$BASE/test_rules.py" -o test_rules.py
curl -fL "$BASE/test_banner_rotation.py" -o test_banner_rotation.py
python3 patch.py server-original.mjs server-test.mjs
python3 test_rules.py server-original.mjs
python3 test_banner_rotation.py server-original.mjs server-test.mjs
```

모든 명령은 운영 가챠포지 파일이나 데이터베이스를 수정하지 않습니다.


## 배너 문서 저장 경로 보완

실제 `hl()` 함수의 달력 배너 채택 분기에서 **기존 달력 배너 문서의 옛 `startedAt/endsAt`가 신규 `fN` 문서에 복사되는 문제**를 확인했습니다. 패치 생성기가 새 회차의 시각을 두 배너에 명시하도록 수정되었습니다.

`test_banner_persistence.py`는 원본의 `hl()` 구현을 그대로 추출하고 문서 조회·작성·갱신 함수에 **모의 저장소**를 연결합니다. 달력 배너 채택과 만료된 배너의 차기 회차 저장 요청을 확인하지만 **실제 Marinara 데이터베이스 저장과 백그라운드 실행은 검증하지 않습니다.**

```bash
cd ~/gf-customizer-preview
BASE="https://raw.githubusercontent.com/tlsiddl/gacha-forge-customizer/main/experimental/live-integration"
curl -fL "$BASE/patch.py" -o patch.py
curl -fL "$BASE/test_banner_persistence.py" -o test_banner_persistence.py
python3 patch.py server-original.mjs server-test.mjs
python3 test_banner_persistence.py server-test.mjs
```

**Glimmer 정가 상점:** 현재 실제 게임 저장 로직과 중복 지급 정책을 검토 중이며 아직 기능 코드가 구현되지 않았습니다. 검증 전에는 기존 재화·로스터 데이터를 수정하지 않습니다.

## Glimmer 캐릭터 정가 교환 API (실험 기능)

신규 `POST /api/gacha-forge/gf-customizer/exchange` (Gacha Forge 라우트 내부: `/gf-customizer/exchange`)를 시험 패치에 추가했습니다. JSON 본문은 `{"runId":"...","characterId":"..."}` 형식입니다.

* 기존 **Glimmer**를 사용하며 새 화폐를 만들지 않습니다.
* **임시 가격: 4성 120, 5성 600 Glimmer.** 사용자 확정 가격이나 게임 원작 가격이 아닙니다.
* 존재하지 않는 캐릭터·무기·3성 대상은 차단합니다. 신규 캐릭터는 `roster[id]={level:1,bondFights:0}`으로 기록합니다.
* 이미 보유한 캐릭터는 원본 `vf()`로 Facet을 올립니다. **최대 Facet이면 교환을 거부하고 Glimmer를 차감하지 않습니다.**
* 잔액 차감과 캐릭터 지급은 같은 세션 문서의 사본에 적용한 뒤 **한 번의 `Pe()` revision-checked 저장**으로 요청합니다. 저장 실패 시 원본 메모리 상태를 유지합니다.
* 실행 중 동시 구매, 여러 사용자 인증, 리플레이 방지, 실제 클라이언트 연동, 서버 영속 저장 결과는 **검증되지 않았습니다**.

```bash
cd ~/gf-customizer-preview
BASE="https://raw.githubusercontent.com/tlsiddl/gacha-forge-customizer/main/experimental/live-integration"
curl -fL "$BASE/patch.py" -o patch.py
curl -fL "$BASE/test_exchange.py" -o test_exchange.py
python3 patch.py server-original.mjs server-test.mjs
python3 test_exchange.py server-test.mjs
```

테스트는 실제 계정의 재화나 캐릭터를 지급·차감하지 않습니다. **운영 서버에 아직 설치하지 마세요.**


## 캐릭터별 누적 가격 규칙

각 세션의 `gfCustomizer.exchangeCounts[characterId]`에 **상점 교환에 성공한 횟수**만 기록합니다. 4성 최초 100, 5성 최초 300 Glimmer, 이후 각 캐릭터별 성공 횟수에 따라 +20씩 인상됩니다. 다른 캐릭터 교환이나 일반 가챠 획득으로 이 값이 오르지 않습니다.

최대 돌파(`facet >= Sn`) 캐릭터는 비용 차감 전에 `max-facet` 오류로 교환을 거부합니다. 비용, 캐릭터 지급, 교환 횟수는 동일한 세션 문서의 변경본을 단 한 번 저장하도록 요청합니다. **서버 측 구매 중복 요청 방어, 실제 동시 구매 및 소유자 권한 검사는 아직 완료되지 않아 운영 설치 금지입니다.**

```bash
cd ~/gf-customizer-preview
curl -fL https://raw.githubusercontent.com/tlsiddl/gacha-forge-customizer/4bbb83f377ce567f65b49d2214ba04915aae730c/experimental/live-integration/patch.py -o patch.py
curl -fL https://raw.githubusercontent.com/tlsiddl/gacha-forge-customizer/283a4d7b5a1008bdbea5c3c52bd776ea8239e83a/experimental/live-integration/test_exchange.py -o test_exchange.py
python3 patch.py server-original.mjs server-test.mjs
python3 test_exchange.py server-test.mjs
```


## 교환 상점 미리보기 UI

개인 확장의 설정 패널에 Glimmer 정가 교환 상점 **미리보기**가 추가되었습니다. 4성 100, 5성 300 Glimmer의 기본 규칙을 표시합니다. 구매 버튼은 비활성화되어 실제 결제/재화 변경을 하지 않습니다. 현재 캐릭터 목록, 보유 정보, 누적 교환 횟수, 최대 돌파 상태의 서버 조회 기능은 연결되지 않았습니다.

**보안 차단:** 현재 시험 `/gf-customizer/exchange` 서버 API에는 실제 호출자와 요청된 runId의 소유권을 검증하는 연결이 없습니다. `Ae(registry,runId)`는 세션의 존재만 확인하므로 소유권 검증으로 간주하면 안 됩니다. 또한 HTTP 재시도·동시 실행에 대한 멱등성 처리가 검증되지 않았습니다. 이 문제를 해결하기 전 **서버 패치를 운영 환경에 절대 설치하지 마세요**.

시험 UI의 JavaScript 문법 확인 (기존 Docker의 Node.js 활용):
```bash
cd ~/gf-customizer-preview
curl -fL https://raw.githubusercontent.com/tlsiddl/gacha-forge-customizer/b5a34ea1051bc6b1ea817ea0f0e28081f1bdbc8b/experimental/live-integration/extension.js -o extension.js
docker exec -i marinara-engine-marinara-1 node --check - < extension.js
```


## 캐릭터 조회 ID 구조와 격리 테스트

원본 Gacha Forge 1.8.12의 단위 문서는 `runId:unit:unitKey` 형태의 전체 ID로 저장되며, 세션 `roster`도 전체 ID를 키로 사용합니다. 조회 API는 `a.list(packageId,"unit")` 중 선택된 `runId:unit:` 접두어에 해당하는 문서만 표시하도록 작성했습니다. 모의 테스트는 다른 세션, 무기, 최대 돌파 여부, 캐릭터별 교환 횟수 및 인증 실패 시 자료 조회 차단을 확인합니다.

```bash
cd ~/gf-customizer-preview
curl -fL https://raw.githubusercontent.com/tlsiddl/gacha-forge-customizer/b6437711c19b2dbca7db4b782bff4833c00575b8/experimental/live-integration/test_catalog.py -o test_catalog.py
python3 test_catalog.py server-test.mjs
```

**경고:** 관리자 비밀키를 브라우저에 입력하는 현 설계는 운영용 인증 구조가 아닙니다. 별도의 세션 소유권 검증 및 서버 측 안전한 인증 후에만 출시해야 합니다. 이 모의 테스트가 실제 API 보호·개인정보 격리·브라우저 실행을 입증하지는 않습니다.


## 구매 API 안전장치 1차 보강 (실험, 운영 사용 금지)

`/gf-customizer/exchange`에 서버 환경변수 `GF_CUSTOMIZER_SECRET`와 요청 본문의 `secret` 일치 확인을 추가했습니다. 모든 구매 요청은 16~128자의 영숫자·`_`·`-`로 된 `requestId`가 필수입니다. 성공 교환 시 세션 저장 문서의 `gfCustomizer.exchangeReceipts[requestId]`에 가격·캐릭터·교환 횟수 영수증을 저장합니다. 같은 ID가 재전송되면 이전 영수증을 반환하고 잔액을 다시 차감하지 않습니다. 동일 ID를 다른 캐릭터에 사용하면 요청을 거부합니다.

이는 **개발용 관리자 게이트와 요청별 멱등성 1차 구현**으로, 정상 사용자 세션 소유권 검증이 아닙니다. `Pe()`의 동시 요청 경쟁과 서버 저장 원자성이 실제 환경에서 충분히 보장되는지 아직 검증하지 않았습니다. 구매 버튼은 계속 비활성화합니다. 실제 운영 서버에 설치하지 마세요.

```bash
cd ~/gf-customizer-preview
curl -fL https://raw.githubusercontent.com/tlsiddl/gacha-forge-customizer/67e1cdf6ab2fd830f270ed29bb1b00fe79d218a7/experimental/live-integration/patch.py -o patch.py
curl -fL https://raw.githubusercontent.com/tlsiddl/gacha-forge-customizer/f88c194fdde0739328369d12cedb27dadc405e6f/experimental/live-integration/test_exchange.py -o test_exchange.py
python3 patch.py server-original.mjs server-test.mjs
python3 test_exchange.py server-test.mjs
```


## 동시 구매 충돌 테스트 (모의 CAS 저장소)

`test_exchange_concurrency.py`는 시험 패치에서 **실제 구매 핸들러를 추출**한 뒤 동일 세션·동일 revision을 읽은 두 요청을 동시에 재개합니다. 모의 `Pe()`는 revision 비교 후 단 한 요청의 데이터만 채택합니다. 성공한 요청 ID를 다시 보내면 중복 차감되지 않는지도 확인합니다.

```bash
cd ~/gf-customizer-preview
curl -fL https://raw.githubusercontent.com/tlsiddl/gacha-forge-customizer/1696587559967ce665c01e7d77c58a8e5ccbf864/experimental/live-integration/test_exchange_concurrency.py -o test_exchange_concurrency.py
python3 test_exchange_concurrency.py server-test.mjs
```

**주의:** 모의 저장소의 revision-CAS 작동을 검사하는 테스트이지 운영 Marinara `Pe()`의 원자성을 입증하는 시험이 아닙니다. 또한 개발용 관리자 비밀키는 사용자별 세션 소유권 검증이 아닙니다. 운영 서버 패치 및 구매 버튼 활성화는 계속 금지합니다.


## 실제 저장소·세션 경계 조사 (2026-10-20)

사용자가 제공한 Gacha Forge 1.8.12 `server.mjs`에서 다음을 확인했습니다.

- `Pe(runId, doc, data)`는 기존 문서 업데이트에 `a.update({ expectedRevision: doc.revision, ... })`를 사용합니다. 충돌 감지를 **요청**하지만, `a.update` 내부의 원자성을 확인한 것은 아닙니다.
- `Ae(registry, runId)`는 `registry.runs`에서 runId를 찾을 뿐 호출자 소유권을 판정하지 않습니다.
- `Gn(characterId)`는 제공된 문서 ID를 그대로 조회합니다. 캐릭터 구매에는 선택 세션의 `runId:unit:` 접두어 검사도 필요합니다.

**안전 조치:** 구매 API는 기본값에서 항상 `exchange-disabled`를 반환합니다. 서버 환경변수 `GF_CUSTOMIZER_ENABLE_EXCHANGE=1`을 설정해야 시험 구매 핸들러가 진행되지만 **소유권 검증이 없어 운영 환경에서는 해당 플래그를 절대 설정하면 안 됩니다.** 구매 요청 ID는 재시도 중복 차감을 막기 위해 사용되지만 실제 동시성 보장 및 사용자별 접근 제한은 별도 과제입니다. UI의 실제 구매 버튼은 비활성화 상태입니다.

회귀 테스트는 **개발용 모의 컨테이너**에서만 시험 플래그를 켜며 실제 마리나라 서비스의 설정을 변경하지 않습니다.
```bash
cd ~/gf-customizer-preview
curl -fL https://raw.githubusercontent.com/tlsiddl/gacha-forge-customizer/42f57d100eb79de1693b801e788312614aa42858/experimental/live-integration/patch.py -o patch.py
curl -fL https://raw.githubusercontent.com/tlsiddl/gacha-forge-customizer/66a993d2bb060098a45884c36202daad5704a1df/experimental/live-integration/test_exchange.py -o test_exchange.py
curl -fL https://raw.githubusercontent.com/tlsiddl/gacha-forge-customizer/44f24ab67bd2afdf84e26f4fa92a14b984c4865e/experimental/live-integration/test_exchange_concurrency.py -o test_exchange_concurrency.py
python3 patch.py server-original.mjs server-test.mjs
python3 test_exchange.py server-test.mjs
python3 test_exchange_concurrency.py server-test.mjs
```


## 실제 Pe 저장 계약 검사

`test_storage_contract.py`는 제공된 **원본** `server.mjs`의 `Pe()` 함수를 그대로 추출하고, 모의 `a.update`에 `expectedRevision`이 전달되는지 확인합니다. 같은 옛 revision을 사용한 두 번째 저장이 모의 CAS에서 거절되는 상황을 재현합니다. **운영 저장소의 실제 구현은 검증하지 않습니다.**

```bash
cd ~/gf-customizer-preview
curl -fL https://raw.githubusercontent.com/tlsiddl/gacha-forge-customizer/5f3f86487e2f0c2585168b358fc50d73d1ca41f4/experimental/live-integration/test_storage_contract.py -o test_storage_contract.py
python3 test_storage_contract.py server-original.mjs
```

**배포 차단:** `GF_CUSTOMIZER_ENABLE_EXCHANGE` 환경변수 게이트를 켜더라도 관리자 키는 플레이어별 게임 세션 인증이 아닙니다. 마리나라 호스트에서 검증된 사용자 ID와 세션 접근 권한 정보를 전달해 주는 공식 경로를 찾고 실제 보호 로직을 검증하기 전에는 운영 구매를 활성화하지 않습니다.


## 2026-10-20 — 한 개 확장 UI 정리 및 오프라인 일괄 검사

기존 개인 확장 `extension.js`의 한국어 안내를 존댓말로 정리하고, 실제 구매 버튼이 **계속 비활성화된 시험판**이라는 점을 표시했습니다. `manifest.json`의 설명도 실제 기능 범위에 맞게 업데이트했습니다. 이 변경은 서버 원본이나 저장 데이터를 수정하지 않습니다.

`verify_preview.sh`는 원본으로 시험 패치를 새로 생성하고, JS 문법·기존 모의 회귀 테스트를 실행하며 서비스 재시작·배포를 하지 않습니다. 테스트 스크립트가 빠져 있으면 성공으로 처리하지 않고 중단합니다. **실제 작동/인증/배포 완료를 의미하지 않습니다.**

```bash
cd ~/gf-customizer-preview
curl -fL https://raw.githubusercontent.com/tlsiddl/gacha-forge-customizer/8a4b7f77325571f4b2878529e90509a64bdccaf0/experimental/live-integration/extension.js -o extension.js
curl -fL https://raw.githubusercontent.com/tlsiddl/gacha-forge-customizer/7beee9ec6f301a55afa11afdf260f11cc5f86d1a/experimental/live-integration/manifest.json -o manifest.json
curl -fL https://raw.githubusercontent.com/tlsiddl/gacha-forge-customizer/66efce7f231c367ae42eca9709ec1c0fe39da0ca/experimental/live-integration/verify_preview.sh -o verify_preview.sh
bash verify_preview.sh
```

## 운영 연동 전 원본 대조 (읽기 전용, 2026-10-20)

`predeploy_audit.sh`는 현재 실행 중인 컨테이너의 Gacha Forge 1.8.12 원본 패키지 SHA256, 기존 로컬 원본 복사본 SHA256, Docker 마운트 목적지 메타데이터를 확인합니다. 비밀 환경변수 값과 원본 파일 내용은 출력하지 않습니다. 불일치 시 중단합니다.

```bash
cd ~/gf-customizer-preview
curl -fL https://raw.githubusercontent.com/tlsiddl/gacha-forge-customizer/4c3c8d703dafeeee1198dedf9e9376c50cd81bf2/experimental/live-integration/predeploy_audit.sh -o predeploy_audit.sh
bash predeploy_audit.sh
```

백업·복구 방안, 실제 호스트 인증과 패키지 서명 검증 경로, 격리된 시험 적용 절차가 확정되기 전에는 운영 파일 교체나 환경변수 변경을 하지 마세요.


## 운영 파일 보존 스냅샷 (2026-10-20)

`prepare_isolated_snapshot.sh`는 우선 `predeploy_audit.sh`로 운영 `server.mjs` 해시 일치를 확인하고, `docker cp`를 통해 Gacha Forge 1.8.12 패키지 전체와 컨테이너에 보이는 기존 preload 스크립트를 **호스트의 별도 폴더로 복사**합니다. 커스터마이저 시험 패치와 확장 코드도 함께 보존하고 SHA256 목록을 만듭니다. 서버 재시작, 운영 파일 교체, 설정 변경은 하지 않습니다.

```bash
cd ~/gf-customizer-preview
curl -fL https://raw.githubusercontent.com/tlsiddl/gacha-forge-customizer/b096120124324eb820aa96de6d66d46a04bac0d9/experimental/live-integration/prepare_isolated_snapshot.sh -o prepare_isolated_snapshot.sh
bash prepare_isolated_snapshot.sh
```

이 백업은 **패키지와 스크립트 및 시험 결과물에 한정**됩니다. Gacha Forge 게임 세이브, Marinara 전체 데이터베이스, Docker 볼륨 전부의 백업이 아닙니다. `/app/data` 볼륨과 서비스 전반의 완전한 롤백 계획을 준비하기 전에는 배포·재시작·운영 구매 활성화를 하면 안 됩니다. 백업 원본은 수동 복구용으로 따로 보관하며, 복구 작업은 수행하지 않습니다.


## ESM 런타임 훅 시험판 (운영 연결 전, 2026-10-20)

`patch.py --edits-output`으로 원본→패치본의 **정확 일치 문자열 수정 목록**을 JSON으로 생성합니다. `gf-customizer-runtime.cjs`는 Node 22+ `registerHooks`에서 가챠포지 1.8.12 실행 스냅샷을 대상으로, `nextLoad()`의 기존 로더 변환 결과에 이 수정 목록을 적용합니다. 모든 원본 시그니처가 정확히 1회 일치하지 않으면 **어떠한 수정도 적용하지 않고** 기존 결과를 반환합니다. 원본·스냅샷·매니페스트는 직접 수정하지 않습니다. 현재 `GF_CUSTOMIZER_ENABLE_EXCHANGE`를 운영에서 켜지 마세요.

다음 명령은 오프라인 파일만 생성하고, 독립된 Node 프로세스로 **변환 일치/상위 수정 보존/불일치 시 안전 중단**을 검사합니다. 운영 Docker 환경변수/Compose/파일은 변경하지 않습니다.

```bash
cd /home/ubuntu/marinara-migration/Marinara-Engine/gf-customizer-integration
BASE=https://raw.githubusercontent.com/tlsiddl/gacha-forge-customizer
curl -fL "$BASE/d9ad7dbce6903601a84a4dd5137c2c66184b2f27/experimental/live-integration/patch.py" -o patch.py
curl -fL "$BASE/13e336ad3519119cfa05248ccf9949535f5a4880/experimental/live-integration/gf-customizer-runtime.cjs" -o gf-customizer-runtime.cjs
curl -fL "$BASE/ee22781bade3f2170bc1e6135c26014c14c09903/experimental/live-integration/test_runtime_loader.py" -o test_runtime_loader.py
python3 patch.py server-original.mjs server-test.mjs --edits-output gf-customizer-edits.json
python3 test_runtime_loader.py
```

**미검증:** 실제 한글/CG 로더의 합성 결과, 마리나라 호스트 실행과 서버 API 등록, 클라이언트 확장 화면. 위 모의 입력의 상위 수정 보존 시험은 실제 로더 체인과 동등하다고 보장하지 않습니다. 통과 전에는 운영 연결을 진행하지 않습니다.


## 기존 한글·CG 훅과 실제 소스 합성 확인 (격리 프로세스)

`test_hook_chain.py`는 기존 서버 컨테이너 안에서 **새 Node 프로세스**를 실행합니다. 이미 등록된 `NODE_OPTIONS` 로더를 사용하여 1.8.12 스냅샷의 코드를 **로딩만** 하고, 최종 가로채기 훅에서 수정된 서버 모듈을 **실행하지 않고 무해한 ES 모듈로 교체**합니다. 실제 한글·CG 소스 변환 결과에 커스터마이저 수정 목록이 적용되는지 확인합니다. 원본 파일, 운영 환경변수, 데이터 볼륨, Compose 설정, 게임 상태는 변경하지 않습니다.

```bash
cd /home/ubuntu/marinara-migration/Marinara-Engine/gf-customizer-integration
curl -fL https://raw.githubusercontent.com/tlsiddl/gacha-forge-customizer/fa5c43d42040c25464674757c0e86e97c4ffe591/experimental/live-integration/test_hook_chain.py -o test_hook_chain.py
python3 test_hook_chain.py
```

**주의:** 위 합성 검사는 실행 스냅샷 경로 `7d3883c2-c1f5-4f22-a362-2b1d04e868ae`를 사용하며, 해당 스냅샷이 사라지면 실패합니다. 이는 운영 로더 설치 및 실제 API 통신 확인이 아닙니다. 실험 준비용 `test_hook_chain.sh`는 실제 실행 검사를 구현하지 않았으니 사용하지 마세요.

## 관리자 인증 재사용 (2026-10-20)

배경 관리자 확장처럼 클라이언트가 마리나라 브라우저의 `marinara_admin_secret`을 **요청 시점에만** 읽고, `X-Admin-Secret`과 `X-Marinara-CSRF: 1`을 전송합니다. 인증키는 커스터마이저 설정이나 저장소에 복사하지 않습니다. `GF_CUSTOMIZER_SECRET` UI 입력창은 제거했습니다.

서버의 **설정 변경과 읽기 전용 목록**은 마리나라 `/api/gacha-forge/*` 게이트웨이에서 관리자 인증을 강제한다는 전제하에 추가 비밀키를 요구하지 않습니다. 이 전제를 검증하지 않고 직접 포트로 노출하거나 독립 Fastify 라우트에 설치하면 안 됩니다. 구매 API는 여전히 자체 비밀키를 요구하고, 기본적으로 비활성화됩니다.

운영 서버에 이미 올린 `gf-customizer-edits.json`은 **이 변경이 반영되지 않은 구버전**입니다. 새 `patch.py`로 재생성해야 적용됩니다. `gf-customizer-runtime.cjs` 자체의 수정은 필요하지 않습니다. 재배포 후 반드시 인증 없이 403, 관리자 인증으로 200/정상 JSON을 확인하고, 인증 실패 시 되돌리세요. 기존 개인 확장도 새 `extension.js`로 갱신해야 합니다.
