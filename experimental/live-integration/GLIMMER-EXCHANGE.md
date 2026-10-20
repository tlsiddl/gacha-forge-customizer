# Glimmer 교환 (서버 패치 v0.6.0-dev 기준)

Gacha Forge 1.8.12 + Marinara Engine 2.5.0 기준입니다.

## 보안 검토 결과 (2026-10-21)

원본 소스(`Pasta-Devs/Marinara-Agents` 1.8.12, `server.mjs` SHA256 `6bd9ec1f…` 일치, `Pasta-Devs/Marinara-Engine` 2.5.0)를 직접 읽고, 실제 서버 모듈을 실행해 확인했습니다.

| 항목 | 결과 |
|---|---|
| 권한 | `/api/gacha-forge/*` 전체가 Marinara의 `requirePrivilegedAccess`를 거칩니다 (허용 호스트 → Basic Auth → 루프백이 아니면 `X-Admin-Secret`). 교환 API도 게임의 `/shop/buy`와 **같은 문**을 지납니다. |
| 게임 소유자 | Gacha Forge에는 사용자별 소유 개념이 없습니다 (월드 목록 하나를 서버 관리자가 소유). 따라서 별도 소유권 검사는 존재할 수 없고, 위 관리자 게이트가 경계입니다. |
| 별도 구매 비밀키 | 위 게이트와 중복이고, 화면 입력·요청 본문 전송이 오히려 노출 위험이라 **제거**했습니다. 켜는 스위치는 `GF_CUSTOMIZER_ENABLE_EXCHANGE=1` 하나입니다. |
| 동시성 | 저장은 원본 `Pe()` → Marinara `update(expectedRevision)`이며, Marinara는 트랜잭션을 한 번에 하나씩 처리합니다(`file-backed-store.ts`). 실제 서버 모듈로 동시 20건·게임 상점 구매와 동시 실행을 돌려 이중 차감·유실 0건을 확인했습니다. |
| 재시도 | 같은 요청 ID는 영수증으로 한 번만 처리됩니다. 영수증은 최근 200건만 보관합니다(무한 증가 방지). |
| 판매 대상 (수정) | 이전 패치는 월드의 모든 4·5성 캐릭터 문서를 팔았기 때문에 **미래 픽업용으로 미리 만들어진 캐릭터도 살 수 있었습니다.** 이제 상시 풀 + 지난·현재 픽업 + 이미 보유한 캐릭터만 판매합니다. |
| 지급 형태 | 신규 `{level:1,bondFights:0}`, 보유 시 `vf()` 패싯 +1 — 원본 소환·아이템 지급 코드와 같습니다. 구매 전 원본 `/shop/buy`처럼 `Zt()`(계정 정보 준비)를 호출합니다. |

남은 전제: 서버가 공개 IP라면 Marinara의 `ADMIN_SECRET`과 HTTPS(또는 Tailscale 등)가 설정되어 있어야 합니다. 이것은 교환뿐 아니라 게임 전체의 전제입니다. 실제 운영 DB에서의 구매는 아직 해 보지 않았습니다.

## 서버 패치 갱신 (목록 개선 · 구매 준비, 구매는 계속 꺼짐)

벌처에서 실행합니다. 기존 파일은 덮어쓰기 전에 백업합니다.

```bash
cd /root/Marinara-Engine/gf-customizer-integration
curl -fL https://raw.githubusercontent.com/tlsiddl/gacha-forge-customizer/main/experimental/live-integration/patch.py -o patch.v060.py
python3 patch.v060.py server-original.mjs server-v060.mjs --edits-output gf-customizer-edits.v060.json
docker exec -i marinara-engine-marinara-1 node --input-type=module --check < server-v060.mjs && echo SYNTAX_OK
cp -p gf-customizer-edits.json gf-customizer-edits.before-v060.json
cp gf-customizer-edits.v060.json gf-customizer-edits.json
cd /root/Marinara-Engine
docker compose -f docker-compose.yml -f docker-compose.override.yml -f docker-compose.gf-customizer.yml up -d --no-deps --force-recreate marinara
docker logs --tail 80 marinara-engine-marinara-1 2>&1 | grep -E "gf-customizer|gacha-forge@"
```

정상이면 `applied 14 edits in memory`와 `Activated and verified capability package gacha-forge@1.8.12`가 보입니다.

되돌리기:

```bash
cd /root/Marinara-Engine/gf-customizer-integration
cp gf-customizer-edits.before-v060.json gf-customizer-edits.json
cd /root/Marinara-Engine
docker compose -f docker-compose.yml -f docker-compose.override.yml -f docker-compose.gf-customizer.yml up -d --no-deps --force-recreate marinara
```

## 구매 켜기 (원할 때만)

`docker-compose.gf-customizer.yml`의 `environment:`에서 `GF_CUSTOMIZER_ENABLE_EXCHANGE` 값을 `"1"`로 바꾸고(항목이 없으면 같은 형식으로 추가; `GF_CUSTOMIZER_SECRET`은 이제 쓰지 않으므로 그대로 두어도 무방) 위와 같은 `up -d --no-deps --force-recreate marinara`를 실행합니다. 끌 때는 `"0"`. 켜기 전에 `/root/Marinara-Engine` 데이터 백업(`backup_live_data.sh`)을 권장합니다.
