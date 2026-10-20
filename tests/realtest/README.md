# 실제 게임 코드로 하는 테스트

원본 Gacha Forge 1.8.12(`Pasta-Devs/Marinara-Agents`, `server.mjs` SHA256 `6bd9ec1f…`)의 **실제 서버 모듈과 실제 클라이언트**를 Marinara와 같은 저장 규칙(리비전 일치할 때만 저장, 트랜잭션 1개씩)의 메모리 저장소 위에서 실행합니다. 운영 서버나 실제 세이브는 건드리지 않습니다.

```bash
git clone --depth 1 https://github.com/Pasta-Devs/Marinara-Agents
git clone --depth 1 https://github.com/tlsiddl/Gacha-Forge-Quest-Extension
python3 ../../patch.py Marinara-Agents/packages/gacha-forge/server.mjs server-patched.mjs
npm i --no-save playwright-core@1.56 && npx playwright install chromium

node test-server.mjs server-patched.mjs              # 교환·목록 서버 보안/정합성 13항목
node test-summon.mjs server-patched.mjs              # 실제 소환으로 풀 패싯 보상(120/600, 0=기본) 확인
node realgame.mjs ../../extension.js Gacha-Forge-Quest-Extension/extension.js shot            # 구매 꺼짐, PC+폰 가로
node realgame.mjs ../../extension.js Gacha-Forge-Quest-Extension/extension.js shot --enable   # 구매 켜짐 흐름 포함
node themes.mjs ../../extension.js theme   # HUD 스타일 5종(vanguard·aurora·bloom·signal·ember) 스크린샷
```

환경 변수: `GF_PKG_DIR`(패키지 폴더), `CHROME_PATH`(Chromium 경로), `GF_SERVER`(패치된 서버 파일).

검증하지 않는 것: Marinara 본체의 인증 게이트 실행, 실제 DB 파일, 이미지·LLM 생성, 휴대폰 실기기.

배포 파일 그대로(로더 + `gf-customizer-edits.json`) 원본을 메모리에서 고치는지 확인하려면, 원본을 `.../capability-runtime-snapshots/gacha-forge-1.8.12-아무거나/server.mjs` 경로에 복사한 뒤:

```bash
GF_CUSTOMIZER_EDITS_PATH=$PWD/../../gf-customizer-edits.json node --require=$PWD/../../gf-customizer-runtime.cjs test-server.mjs <복사한 server.mjs>
```
