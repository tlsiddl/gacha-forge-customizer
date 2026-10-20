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
