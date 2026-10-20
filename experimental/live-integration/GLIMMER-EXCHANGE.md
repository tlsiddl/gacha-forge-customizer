# Glimmer 교환: 관리자용 구매 기능 (v0.5.0-dev)

이 안내서는 Gacha Forge 1.8.12 및 Marinara Engine 2.5.0의 기존 개인 확장/서버 패치 구성을 기준으로 작성되었습니다.

## 안전 원칙

- 구매 API는 기본적으로 **꺼져 있습니다**. `GF_CUSTOMIZER_ENABLE_EXCHANGE=1`을 서버에 명시하고 24자 이상의 `GF_CUSTOMIZER_SECRET`을 지정해야만 사용할 수 있습니다.
- 클라이언트는 구매 전용 비밀키를 **브라우저 저장소에 기록하지 않습니다**. 구매 시 요청 본문으로만 전송합니다. 개인 전용 HTTPS/Tailscale 연결과 서버 관리자 접근 보호가 필요합니다.
- 이것은 **서버 관리자용 교환 기능**입니다. 현재 게임 계정별 소유자 인증을 제공하지 않으므로 다중 사용자 환경에서 공개 구매 기능으로 사용하지 마세요.
- 서버는 `runId`, 캐릭터의 해당 run 소속 여부, 비주인공 캐릭터, 4/5성, 최대 패싯, 정수 잔액, 가격, 요청 ID를 검사합니다.
- 구매 요청은 지갑 차감·캐릭터 지급·교환 횟수·요청 영수증을 **하나의 리비전 조건부 저장**으로 갱신합니다. 저장 충돌 시 요청이 실패합니다.
- 동일 `requestId`가 재전송되면 동일한 구매 영수증을 재사용하며 추가 차감하지 않습니다. 네트워크 오류 시 새 요청 ID를 생성하지 않고 재시도할 수 있게 UI에서 대기 ID를 유지합니다.
- 판매 가격: 4성 100 / 5성 300 Glimmer부터 시작, 성공할 때마다 해당 캐릭터의 다음 가격 +20.
- 원본 패키지나 기존 게임 세이브 데이터를 직접 편집하지 않습니다.

## 벌처 패치 준비 (운영 반영 전)

```bash
cd /root/Marinara-Engine/gf-customizer-integration

cp -p gf-customizer-edits.json gf-customizer-edits.pre-exchange.json

curl -fL https://raw.githubusercontent.com/tlsiddl/gacha-forge-customizer/main/experimental/live-integration/patch.py -o patch.exchange.py

python3 patch.exchange.py server-original.mjs server-exchange.mjs \
  --edits-output gf-customizer-edits.exchange.json

docker exec -i marinara-engine-marinara-1 node --input-type=module --check < server-exchange.mjs

python3 - <<'PY'
import json
from pathlib import Path
data=json.loads(Path('gf-customizer-edits.exchange.json').read_text())
src=Path('server-exchange.mjs').read_text()
assert len(data['edits'])==14
assert 'GF_CUSTOMIZER_ENABLE_EXCHANGE!=="1"' in src
assert 'character.kind!=="character"||character.isProtagonist' in src
assert 'const balance=Number(next.wallet.glimmer);' in src
assert 'Kt=gfPity(U,Q,ne,m)' in src
print('PASS: 14개 패치, 구매 안전 검사, 기존 천장 유지')
PY
```

검사를 통과하기 전에 기존 `gf-customizer-edits.json`을 교체하지 마세요.

## 배포 및 설정

검증 후 기존 패치 파일을 백업한 상태로 새 JSON을 복사하고, 아래 기존 Compose 파일 **3개 모두**를 사용해 컨테이너를 재생성합니다.

```bash
cd /root/Marinara-Engine/gf-customizer-integration
cp -p gf-customizer-edits.json gf-customizer-edits.pre-exchange-deploy.json
cp gf-customizer-edits.exchange.json gf-customizer-edits.json
cd /root/Marinara-Engine
docker compose -f docker-compose.yml -f docker-compose.override.yml -f docker-compose.gf-customizer.yml \
  up -d --no-deps --force-recreate marinara
```

로그에서 `[gf-customizer] applied 14 edits in memory`를 확인합니다. 기존 14개 패치의 교체이므로 항목 수는 늘어나지 않습니다.

개인 확장도 `experimental/live-integration`의 **v0.5.0-dev**를 설치/갱신해야 구매 UI가 나타납니다.

구매 활성화는 별도 작업입니다. 구매 기능을 켜려면 Docker Compose에 `GF_CUSTOMIZER_ENABLE_EXCHANGE=1`과 충분히 긴 비밀키를 안전하게 전달해야 합니다. 비밀키를 GitHub, 채팅 로그, 스크린샷 또는 공개 Compose 파일에 넣지 마세요. 활성화 전에는 재화가 실제로 변경되는 테스트를 진행하지 마세요.

## 롤백

```bash
cd /root/Marinara-Engine/gf-customizer-integration
cp gf-customizer-edits.pre-exchange-deploy.json gf-customizer-edits.json
cd /root/Marinara-Engine
docker compose -f docker-compose.yml -f docker-compose.override.yml -f docker-compose.gf-customizer.yml \
  up -d --no-deps --force-recreate marinara
```

**미검증 범위:** 실제 구매 트랜잭션 통합 테스트, 동시 요청 경쟁 상태의 실제 저장소 동작, 다중 사용자 소유권 인증. 운영 사용 전 별도 검증이 필요합니다.
