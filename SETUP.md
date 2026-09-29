# 냉장고뱅크 — 2인 공유 + 폰 접속 설정

계정 두 개(Supabase, GitHub)만 만들면 나머지는 Claude가 해줄 수 있습니다. 둘 다 무료.

## 1. Supabase (공유 DB) — 약 5분

1. https://supabase.com → **Start your project** → GitHub 계정 또는 이메일로 가입
2. **New project**
   - Name: `fridgebank`
   - Database Password: 아무거나 강하게 (따로 쓸 일 없음, 메모만)
   - Region: **Northeast Asia (Seoul)**
3. 프로젝트가 만들어지면 왼쪽 **SQL Editor** → `supabase/schema.sql` 내용을 통째로 붙여넣고 **Run**
4. 왼쪽 **Project Settings → API** 에서 두 값을 복사
   - `Project URL` (https://xxxx.supabase.co)
   - `anon` `public` 키 (eyJ… 로 시작하는 긴 문자열 — **service_role 키 말고 anon 키**)
5. 이 두 값을 `config.js` 의 `supabaseUrl`, `supabaseAnonKey` 에 넣기 (Claude에게 알려주면 넣어줌)
   - anon 키는 공개돼도 되는 키입니다. 데이터는 로그인 + 같은 집 구성원만 볼 수 있게 DB 규칙(RLS)으로 막혀 있습니다.
6. 배포 주소가 생긴 뒤: **Authentication → URL Configuration**
   - Site URL: 배포 주소 (예: `https://아이디.github.io/fridgebank/`)
   - Redirect URLs 에 같은 주소 + `http://localhost:5178/` 추가 (로그인 메일 링크가 돌아올 곳)

## 2. GitHub Pages (인터넷 주소) — 약 5분

1. https://github.com 가입
2. 새 저장소 `fridgebank` 만들기 (Public — 무료 Pages 는 공개 저장소. 코드에 개인정보 없음, 재료 데이터는 Supabase 에만 저장)
3. Claude에게 "푸시해줘" → 이 폴더를 올리고 **Settings → Pages → Branch: main** 설정
4. 1~2분 뒤 `https://아이디.github.io/fridgebank/` 로 접속

## 3. 쓰기 시작

1. 배포 주소 접속 → 이메일 입력 → 메일의 링크 누르기
2. **새 집 만들기** → 참여 코드(8자리)가 설정 탭에 표시됨. 이 기기의 재료 목록이 그대로 올라감
3. 같이 쓸 사람: 같은 주소 접속 → 자기 이메일로 로그인 → **참여 코드 입력**
4. 폰: 브라우저 메뉴 → **홈 화면에 추가** → 앱처럼 실행

## 참고

- 로그인 전·오프라인일 때도 이 기기에 저장되고, 연결되면 바뀐 것만 올라갑니다.
- 같은 재료를 두 사람이 동시에 고치면 나중에 저장한 쪽이 남습니다.
- 마트 할인은 매주 목요일 09:00 예약 작업이 `data/emart_deals.js` 를 갱신합니다 (PC 와 Claude 앱이 켜져 있어야 함). 배포 후에는 갱신된 파일을 GitHub 에 올려야 폰에도 반영됩니다.
