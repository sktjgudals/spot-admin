# Dopa Admin

Dopa 서비스의 관리자 패널입니다. 슈퍼 어드민과 업체 어드민을 위한 풀스택 웹 애플리케이션입니다.

## 기술 스택

- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript
- **Database**: PostgreSQL + Prisma ORM
- **Auth**: NextAuth v5 (이메일/패스워드)
- **UI**: shadcn/ui + Tailwind CSS v4
- **Payments**: Toss Payments

## 시작하기

### 환경 변수 설정

`.env` 파일을 생성하고 아래 변수를 설정하세요:

```env
DATABASE_URL=postgresql://...
AUTH_SECRET=...
```

### 설치 및 실행

```bash
npm install

# DB 스키마 반영
npm run db:push

# 시드 데이터 삽입 (슈퍼 어드민 계정 생성)
npm run db:seed

# 개발 서버 실행 (http://localhost:3001)
npm run dev
```

## 역할

| 역할 | 설명 |
|------|------|
| `SUPER_ADMIN` | 전체 관리 — 유저, 업체, 파티, 정산 |
| `BUSINESS` | 소속 업체의 파티 및 정산만 관리 |

## 주요 기능

- **유저 관리**: 가입 유저 조회, 차단/해제
- **파티 관리**: 파티 생성·수정·삭제, 신청자 승인/거절
- **업체 관리**: 업체 등록, 어드민 초대, 상태 관리
- **정산 관리**: Toss Payments 기반 결제 및 정산 내역
- **슈퍼 어드민**: 어드민 계정 생성, 업체 배정

## DB 명령어

```bash
npm run db:push     # 스키마 변경사항 DB에 반영
npm run db:seed     # 초기 데이터 삽입
npm run db:studio   # Prisma Studio 실행
```
