(() => {
  "use strict";
  const manifestHash = "4e63bd9564b523bade086216f69c208aaa56f4e2d3ed37b49088d0f8922dbee2";
  const rooms = [
    "01a023b7-a96d-71a8-b4b6-81ac89ad0785",
    "01a023f5-8f00-709d-a213-a668285f877f",
    "01a02406-1642-7137-a4d2-6bda437b9b7f",
    "01a03601-d149-7026-a6dc-7c1465262e13",
  ];
  const inspect = document.getElementById("inspect");
  const retire = document.getElementById("retire");
  const status = document.getElementById("status");
  const result = document.getElementById("result");
  let inspections = [];
  async function session() {
    const response = await fetch("https://api.dopa.ing/auth/v2/admin/refresh", {
      method: "POST", credentials: "include", redirect: "error",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ useCookie: true }),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error(`관리자 로그인 확인 필요 (${response.status})`);
    const data = await response.json();
    if (data.admin?.role !== "SUPER_ADMIN" || typeof data.accessToken !== "string") {
      throw new Error("SUPER_ADMIN 권한이 필요합니다.");
    }
    return data.accessToken;
  }
  async function request(token, roomId, expectedDigest) {
    const response = await fetch("https://api.dopa.ing/admin/v2/party-reset/chat", {
      method: "POST", redirect: "error",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ manifestHash, roomId, ...(expectedDigest ? { expectedDigest } : {}) }),
      signal: AbortSignal.timeout(60000),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(`${roomId}: ${response.status} ${data.message ?? "정리 조건 확인 필요"}`);
    return { roomId, digest: data.digest, retired: data.retired, users: data.users };
  }
  async function run(execute) {
    inspect.disabled = true;
    retire.disabled = true;
    const output = [];
    try {
      const token = await session();
      if (!execute) inspections = [];
      for (const roomId of rooms) {
        status.textContent = `${execute ? "정리" : "현황 확인"} 중: ${output.length + 1}/4`;
        const digest = execute ? inspections.find((row) => row.roomId === roomId)?.digest : undefined;
        if (execute && !digest) throw new Error("전체 현황을 먼저 확인하세요.");
        output.push(await request(token, roomId, digest));
        result.textContent = JSON.stringify({ manifestHash, phase: execute ? "retire" : "inspect", rooms: output }, null, 2);
      }
      if (!execute) inspections = output;
      status.textContent = execute ? "채팅 4개 정리 완료" : "채팅 4개 현황 확인 완료";
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : "작업 실패";
    } finally {
      inspect.disabled = false;
      retire.disabled = inspections.length !== rooms.length;
    }
  }
  inspect.addEventListener("click", () => void run(false));
  retire.addEventListener("click", () => void run(true));
})();
