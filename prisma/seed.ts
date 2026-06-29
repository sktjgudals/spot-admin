import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "../src/generated/prisma";

const prisma = new PrismaClient();

async function main() {
  const email = "ceo@dopa.ing";
  const password = "SpotAdmin123!";

  const existing = await prisma.adminAccount.findUnique({ where: { email } });
  if (existing) {
    console.log("슈퍼 어드민 계정이 이미 존재합니다:", email);
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);

  await prisma.adminAccount.create({
    data: {
      email,
      passwordHash,
      name: "슈퍼 어드민",
      role: "SUPER_ADMIN",
    },
  });

  console.log("✅ 슈퍼 어드민 계정 생성 완료");
  console.log("   이메일 :", email);
  console.log("   비밀번호:", password);
  console.log("   ⚠️  첫 로그인 후 반드시 비밀번호를 변경하세요!");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
