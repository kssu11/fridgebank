# Circuit 45 — 폰에 설치하기

냉장고뱅크와 같은 방식입니다. GitHub Pages에 올린 뒤 폰에서 "홈 화면에 추가"하면 앱처럼 실행됩니다. 서버나 DB가 필요 없고 무료입니다.

## 1. GitHub에 올리기 (약 3분)

1. https://github.com/new → Repository name: `circuit45` → **Public** → Create
2. 새 저장소 화면에서 **uploading an existing file** 클릭
3. 이 zip을 푼 폴더 안의 파일 전부(index.html, sw.js, manifest.webmanifest, 아이콘들, .nojekyll)를 끌어다 놓고 **Commit changes**
4. **Settings → Pages → Branch: main / (root) → Save**
5. 1–2분 뒤 `https://kssu11.github.io/circuit45/` 접속

## 2. 갤럭시에 설치

1. 위 주소를 Chrome 또는 삼성 인터넷으로 열기
2. 화면 오른쪽 위 **앱 설치** 버튼 → 설치
   (버튼이 안 보이면 브라우저 메뉴 → **홈 화면에 추가** / **앱 설치**)
3. 홈 화면 아이콘으로 실행 → 전체 화면 앱으로 열림
4. 한 번 열어두면 헬스장에서 데이터가 안 터져도 오프라인으로 동작

## 3. 처음 할 일

- 프로그램 탭 → 나이, 안정시 심박(Samsung Health 아침값) 입력
- 동작 탭 → 덤벨 동작마다 내 무게(kg) 입력 → 타이머 화면에 표시
- 음성 안내: 폰 미디어 볼륨을 켜두세요

## 참고

- 기록·설정은 폰 브라우저 저장소에만 있습니다. 기록 탭의 **백업 파일 저장**으로 가끔 백업하세요.
- 운동 중에는 화면 꺼짐 방지(wake lock)가 켜집니다. 화면을 끄면 타이머 소리가 멈출 수 있습니다.
- 앱을 고친 뒤에는 저장소에 파일을 다시 올리면 다음 실행 때 자동으로 업데이트됩니다.
