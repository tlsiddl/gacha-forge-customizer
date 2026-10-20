# live-integration

배포 파일이 있는 폴더입니다. 설치·사용 설명은 저장소 첫 화면의 [README](../../README.md)를 보세요.

| 파일 | 역할 |
|---|---|
| `manifest.json`, `extension.js` | 개인 확장 (게임 화면 UI) |
| `gf-customizer-runtime.cjs` | 서버 시작 시 Gacha Forge 1.8.12 코드를 메모리에서 고치는 로더 |
| `gf-customizer-edits.json` | 로더가 적용하는 14개 편집 (원본 SHA256 `6bd9ec1f…` 전용) |
| `patch.py` | 원본 `server.mjs`에서 `gf-customizer-edits.json`을 다시 만드는 생성기 |
| `docker-compose.gf-customizer.example.yml` | Docker Compose 추가 파일 예시 |
| `tests/` | 테스트 (실제 게임 코드 테스트는 `tests/realtest`) |
| `tools/backup_live_data.sh` | 운영 컨테이너 `/app/data` 온라인 복사 |
| `legacy/` | 이전 버전 개발용 스크립트 (현재 버전과 맞지 않음, 기록용) |

`gf-customizer-edits.json` 다시 만들기:

```bash
python3 patch.py /path/to/original/server.mjs /tmp/server-patched.mjs --edits-output gf-customizer-edits.json
```
