import { prisma } from "@/lib/prisma";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import UserActions from "./UserActions";

interface SearchParams {
  page?: string;
  q?: string;
}

interface Props {
  searchParams: Promise<SearchParams>;
}

export default async function UsersPage({ searchParams }: Props) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.page ?? 1));
  const q = params.q ?? "";
  const take = 20;
  const skip = (page - 1) * take;

  const where = q
    ? {
        OR: [
          { email: { contains: q, mode: "insensitive" as const } },
          { nickname: { contains: q, mode: "insensitive" as const } },
        ],
      }
    : {};

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take,
      skip,
      select: {
        id: true,
        email: true,
        nickname: true,
        role: true,
        isBlocked: true,
        blockedUntil: true,
        blockReason: true,
        createdAt: true,
        provider: true,
      },
    }),
    prisma.user.count({ where }),
  ]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold">유저 관리</h1>
        <p className="text-sm text-muted-foreground">전체 {total.toLocaleString()}명</p>
      </div>

      <div className="rounded-md border bg-background overflow-x-auto">
        <Table className="min-w-[640px]">
          <TableHeader>
            <TableRow>
              <TableHead>닉네임</TableHead>
              <TableHead>이메일</TableHead>
              <TableHead>가입</TableHead>
              <TableHead>권한</TableHead>
              <TableHead>상태</TableHead>
              <TableHead>가입일</TableHead>
              <TableHead className="w-24">관리</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((user) => (
              <TableRow key={user.id}>
                <TableCell className="font-medium">
                  <Link
                    href={`/super-admin/users/${user.id}`}
                    className="text-primary hover:underline"
                  >
                    {user.nickname}
                  </Link>
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {user.email}
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="text-xs">
                    {user.provider}
                  </Badge>
                </TableCell>
                <TableCell>
                  {user.role === "SUPER_ADMIN" ? (
                    <Badge className="text-xs">슈퍼 어드민</Badge>
                  ) : user.role === "ADMIN" ? (
                    <Badge variant="secondary" className="text-xs">업체 어드민</Badge>
                  ) : (
                    <Badge variant="outline" className="text-xs">일반</Badge>
                  )}
                </TableCell>
                <TableCell>
                  {user.isBlocked ? (
                    <Badge variant="destructive" className="text-xs">정지</Badge>
                  ) : (
                    <Badge variant="secondary" className="text-xs">정상</Badge>
                  )}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                  {user.createdAt.toLocaleDateString("ko-KR")}
                </TableCell>
                <TableCell>
                  <UserActions user={user} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
