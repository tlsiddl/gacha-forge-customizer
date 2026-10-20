# 보안 검토 (v0.6.1)

대상: Gacha Forge 1.8.12 + Marinara Engine 2.5.0. 2026-10-21 검토.

원본 소스를 직접 읽고(`Pasta-Devs/Marinara-Agents` 1.8.12 — `server.mjs` SHA256 `6bd9ec1f…` 일치, `Pasta-Devs/Marinara-Engine` 2.5.0), 실제 서버 모듈을 Marinara와 같은 저장 규칙의 메모리 저장소에서 실행해 확인했습니다.

## 결론

| 항목 | 결과 |
|---|---|
| 권한 | `/api/gacha-forge/*` 전체가 Marinara의 `requirePrivilegedAccess`를 거칩니다(허용 호스트 → Basic Auth → 루프백이 아니면 `X-Admin-Secret`). 교환 API도 게임 자체의 `/shop/buy`와 **같은 문**을 지납니다. |
| 게임 소유자 | Gacha Forge에는 사용자별 소유 개념이 없습니다(월드 목록 하나를 서버 관리자가 소유). 별도 소유권 검사가 들어갈 자리가 없고, 위 관리자 게이트가 경계입니다. |
| 별도 구매 비밀키 | 이전 버전에 있던 구매 전용 비밀키는 위 게이트와 중복이고, 화면 입력·요청 본문 전송이 오히려 노출 위험이라 **제거**했습니다. 구매는 `GF_CUSTOMIZER_ENABLE_EXCHANGE=1`일 때만 켜집니다. |
| 동시성 | 저장은 원본 `Pe()` → Marinara `update(expectedRevision)`이며, Marinara 파일 저장소는 트랜잭션을 한 번에 하나씩 처리합니다. 실제 서버 모듈로 동시 구매 20건, 게임 상점 구매와 동시 실행을 돌려 이중 차감·유실 0건. |
| 재시도 | 요청 ID별 영수증으로 같은 요청은 한 번만 처리합니다. 저장 충돌이나 응답 불명일 때만 같은 ID로 재시도합니다. 영수증은 최근 200건만 보관합니다. |
| 판매 대상 | 상시 풀 + 지난·현재 픽업 + 이미 보유한 4·5성 캐릭터만 판매합니다. 이전 버전은 **미래 픽업용으로 미리 만들어진 캐릭터도 살 수 있었고**, 이번에 막았습니다. 무기·3성·주인공·다른 월드 캐릭터도 거부합니다. |
| 최대 패싯 | 서버가 거부하고, 화면에는 구매 버튼 대신 "최대 패싯"이 표시됩니다. |
| 지급 형태 | 신규 `{level:1,bondFights:0}`, 보유 시 `vf()`로 패싯 +1. 원본 소환·아이템 지급 코드와 같습니다. 구매 전 원본 `/shop/buy`처럼 `Zt()`를 호출합니다. |
| 화면 코드 | 서버에서 온 이름·텍스트는 모두 `textContent`로 넣습니다. 초상화 주소는 `/` 또는 `https://`로 시작할 때만 씁니다. 확장의 요청 본문은 바이트로 보내서 다른 확장의 통신 관찰에 섞이지 않습니다. |
| 실패 시 | 서버 패치는 원본과 정확히 일치하지 않으면 적용하지 않습니다(fail closed). `module.registerHooks`가 없는 Node에서는 로더가 꺼집니다. |

## 전제

- 서버가 인터넷에 열려 있다면 Marinara의 `ADMIN_SECRET`과 HTTPS(또는 Tailscale 등)가 설정되어 있어야 합니다. 교환뿐 아니라 게임 전체의 전제입니다.
- Marinara 본체의 인증 게이트는 소스를 읽어 확인했고, 실행해서 확인하지는 않았습니다.

## 테스트

| 테스트 | 결과 |
|---|---|
| `tests/realtest/test-server.mjs` — 실제 서버 모듈, 교환·목록 | 13/13 |
| 같은 테스트를 배포 파일(로더 + `gf-customizer-edits.json`)로 원본에 적용해 실행 | 13/13 |
| `tests/realtest/test-summon.mjs` — 실제 소환, 풀 패싯 보상 | 통과 |
| `tests/realtest/realgame.mjs` — 실제 클라이언트 + 퀘스트 확장, 구매 켜짐 | 14/14 |
| `tests/test-extension-jsdom.cjs` | 22/22 |
| `tests/test-exchange-isolated.cjs` | 10/10 |

운영 서버(벌처)에서는 서버 패치 적용(`applied 14 edits`)과 교환 화면 "교환 가능" 표시까지 확인했습니다. 실제 구매는 아직 하지 않았습니다.
