# Gacha Forge 1.27.5 서버 호환 패치

이 디렉터리는 Gacha Forge 1.27.5용 서버 로더와 픽업 인원 추가 로더입니다. 기존 1.8.x 파일은 변경하지 않습니다. 검증된 1.27.5 서버 파일 또는 같은 파일에 한국어 화자 패치만 적용된 코드에서만 커스터마이저가 동작하며, 서명이나 변경 지점이 다르면 해당 패치를 적용하지 않습니다.

`gf-customizer-runtime.cjs`와 `gf-customizer-edits.json`을 각각 `/app/gf-customizer-1275-runtime.cjs`, `/app/gf-customizer-1275-edits.json`으로 읽기 전용 마운트합니다. 추가 픽업 로더와 레시피도 각각 `/app/gf-featured-1275-runtime.cjs`, `/app/gf-featured-1275-edits.json`으로 읽기 전용 마운트하고 `GF_FEATURED_EDITS_PATH`를 레시피 경로로 지정합니다. 이미 같은 픽업 레시피를 마운트해 사용한다면 기존 경로를 유지할 수 있습니다.

기존 `NODE_OPTIONS`를 지우지 말고 한국어 1.27.5 로더가 있다면 그 뒤에 `--require=/app/gf-customizer-1275-runtime.cjs --require=/app/gf-featured-1275-runtime.cjs`를 순서대로 추가합니다. 기존 Compose 설정과 데이터는 먼저 백업하세요. 이 서버 로더만으로 비활성화된 UI 확장이 자동으로 켜지지는 않습니다.

1.27.5 원본과 한국어 로더 조합의 서명·안전한 중단, 교환·중복 요청·소환 보상, 픽업 설정과 생성 프롬프트를 격리 환경에서 검사했습니다. 실제 유료 이미지 생성과 실제 월드 플레이는 별도 확인이 필요합니다.
