# Banner Image Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a SUPER_ADMIN operator add a home banner by uploading an image file from the banner dialog, with schedule fields and correct edit options.

**Architecture:** Extend the generic resource console with an `image` field type rendered by the existing `PartyImageUploader` (presign via `adminFetchJson` → browser PUT to R2), point the banners config at the new worker endpoint `POST /admin/v2/media/upload-url`, fix `datetime` round-tripping in the console, and allow the R2 upload host in CSP.

**Tech Stack:** Next.js 16 (App Router, OpenNext on Cloudflare), React 19, Tailwind v4, @base-ui/react components, TanStack Query, vitest 3 + @testing-library/react + userEvent (jsdom).

**Spec:** `docs/superpowers/specs/2026-09-08-banner-image-upload-design.md`

## Global Constraints

- Runtime boundaries (enforced by `scripts/check-admin-runtime-boundaries.mjs`): no Prisma, no `DATABASE_URL`, no Next `/api/(super-admin|business|party-categories)` routes, no `@/lib/(api-auth|fetch-json|backend-internal|legacy-bff)`. All server data goes through `adminFetchJson` (`src/auth/api/admin-http.ts`) to the Cloudflare Worker.
- Upload endpoint path (verbatim): `/admin/v2/media/upload-url`. It returns `{ uploadUrl, publicUrl, objectKey, contentType, expiresIn }`; the uploader reads only `uploadUrl` and `publicUrl`.
- Banner image hint text (verbatim): `jpeg/png/webp · 최대 10MB · 권장 1600×900 (16:9)`.
- Banner action options, create and edit alike (verbatim, in this order): `NONE, DEEPLINK, WEB, INSTAGRAM, YOUTUBE, PHONE, EMAIL, CUSTOM`.
- Schedule fields: keys `startsAt` / `endsAt`, labels `노출 시작` / `노출 종료`, type `datetime`, optional, on both create and edit.
- `datetime-local` value format: `YYYY-MM-DDTHH:mm` in the browser's local time (the console already converts back with `new Date(raw).toISOString()`).
- CSP connect-src host to add (verbatim, both files): `https://8c676e7121f390b03c3af9a59a9445ca.r2.cloudflarestorage.com` — `src/lib/security-headers.ts` `PRODUCTION_CONNECT_SOURCES` and the `Content-Security-Policy` line in `public/_headers` must stay byte-identical (guarded by `src/lib/security-headers.test.ts` "publishes the same policy on static assets").
- Design rules (guarded by `scripts/test-admin-ui-foundation.mjs`): no raw palette utilities (e.g. `bg-red-500`), no `text-[9|10|11px]`, no alpha focus rings like `focus-visible:ring-ring/50`; use semantic tokens (`bg-muted`, `text-muted-foreground`, `border`, `ring-ring`). Status never conveyed by color alone.
- Tests: vitest + testing-library, assertions by accessible role/name (Korean labels), `cleanup()` in `afterEach`, mocks via `vi.mock` of sibling modules. Run a single file with `npx vitest run <path>`; the whole gate is `npm run verify`.
- Commit messages: conventional prefix, and end the body with these two trailer lines (verbatim):
  ```
  Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01EGEDdZkreRFnjjZmDm9DAZ
  ```
- Work only inside `/Users/seohyeongmin/Desktop/github/dopa-insights-20260908/spot-admin` (git worktree, branch `feat/banner-image-upload`, base `9a9f0d4` = origin/main). Never `cd` into `/Users/seohyeongmin/Desktop/github/spot-admin` (the main checkout).

---

### Task 1: `image` field type, uploader props, editor rendering

**Files:**
- Modify: `src/components/admin/resource-configs/types.ts` (the `Field` type)
- Modify: `src/components/party-image-uploader.tsx` (add `hint` / `preview` props)
- Modify: `src/components/admin/resource-console/ResourceEditorDialog.tsx` (image branch)
- Test: `src/components/party-image-uploader.test.tsx` (create)
- Test: `src/components/admin/resource-console/ResourceEditorDialog.test.tsx` (create)

**Interfaces:**
- Produces (used by Task 2):
  ```ts
  // types.ts
  export type Field = {
    key: string;
    label: string;
    type?: "text" | "number" | "textarea" | "boolean" | "datetime" | "image";
    required?: boolean;
    options?: readonly string[];
    defaultValue?: string | number | boolean;
    /** type === "image" 전용: presign 엔드포인트와 업로더 표시 옵션 */
    upload?: { url: string; hint?: string; preview?: "square" | "wide" };
  };
  // party-image-uploader.tsx — both SingleProps and MultipleProps gain:
  //   hint?: string;  preview?: "square" | "wide";
  ```

- [ ] **Step 1: Write the failing uploader test**

Create `src/components/party-image-uploader.test.tsx`:

```tsx
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth/api/admin-http", () => ({ adminFetchJson: vi.fn() }));

import { PartyImageUploader } from "@/components/party-image-uploader";

describe("PartyImageUploader presentation props", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows the default hint when none is provided", () => {
    render(
      <PartyImageUploader mode="single" value="" onChange={() => {}} uploadUrl="/x" />,
    );
    expect(screen.getByText(/jpeg\/png\/webp · 최대 10MB · 자동 리사이즈\(1920px\)/)).toBeInTheDocument();
  });

  it("replaces the hint and widens the preview for banner images", () => {
    render(
      <PartyImageUploader
        mode="single"
        value="https://media.dopa.ing/banners/a.webp"
        onChange={() => {}}
        uploadUrl="/x"
        hint="jpeg/png/webp · 최대 10MB · 권장 1600×900 (16:9)"
        preview="wide"
      />,
    );
    expect(screen.queryByText(/자동 리사이즈/)).not.toBeInTheDocument();
    const image = screen.getByRole("presentation", { hidden: true });
    expect(image).toHaveAttribute("src", "https://media.dopa.ing/banners/a.webp");
    expect(image.parentElement).toHaveClass("aspect-video");
  });
});
```

Note: in single mode with a value the dropzone (and its hint) is hidden because `canAdd` is false — that is why the second case asserts the hint's absence together with the wide preview. If `getByRole("presentation", { hidden: true })` does not match the `<img alt="">` in your jsdom/testing-library version, select it with `container.querySelector("img")` instead and keep the same assertions.

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/components/party-image-uploader.test.tsx`
Expected: the first case passes (existing behavior); the second FAILS on the `aspect-video` class (and on the hint if you passed one — TypeScript will also reject the unknown props under `tsc`, which is expected before the change).

- [ ] **Step 3: Add the props to the uploader**

In `src/components/party-image-uploader.tsx`:
- Add to **both** `SingleProps` and `MultipleProps`: `hint?: string;` and `preview?: "square" | "wide";`.
- Thumbnail container: replace `className="relative h-24 w-24 overflow-hidden rounded-md border bg-muted"` with
  ```tsx
  className={cn(
    "relative overflow-hidden rounded-md border bg-muted",
    props.preview === "wide" ? "aspect-video w-full max-w-sm" : "h-24 w-24",
  )}
  ```
- Hint paragraph: replace the literal text with
  ```tsx
  {props.hint ??
    `jpeg/png/webp · 최대 10MB · 자동 리사이즈(1920px)${props.mode === "multiple" ? ` · 최대 ${maxFiles}장` : ""}`}
  ```
  (keep the surrounding `<p className="text-xs text-muted-foreground">`).

- [ ] **Step 4: Run the uploader test to verify it passes**

Run: `npx vitest run src/components/party-image-uploader.test.tsx`
Expected: PASS (2/2).

- [ ] **Step 5: Write the failing editor-dialog test**

Create `src/components/admin/resource-console/ResourceEditorDialog.test.tsx`:

```tsx
import { useState } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/party-image-uploader", () => ({
  PartyImageUploader: (props: { uploadUrl: string; onChange: (url: string) => void }) => (
    <button
      type="button"
      data-upload-url={props.uploadUrl}
      onClick={() => props.onChange("https://media.dopa.ing/banners/test.webp")}
    >
      업로드 스텁
    </button>
  ),
}));

import type { ResourceConfig } from "@/components/admin/resource-configs";
import { ResourceEditorDialog } from "@/components/admin/resource-console/ResourceEditorDialog";

const config: ResourceConfig = {
  key: "banners",
  title: "배너 관리",
  description: "",
  resource: "banners",
  columns: [{ key: "title", label: "제목" }],
  create: {
    label: "배너 추가",
    path: "/admin/v2/banners",
    fields: [
      { key: "title", label: "제목", required: true },
      {
        key: "imageUrl",
        label: "이미지",
        type: "image",
        required: true,
        upload: { url: "/admin/v2/media/upload-url", preview: "wide" },
      },
    ],
  },
};

function Harness({ onSubmit }: { onSubmit: (values: Record<string, unknown>) => void }) {
  const [values, setValues] = useState<Record<string, unknown>>({ title: "", imageUrl: "" });
  return (
    <ResourceEditorDialog
      config={config}
      editor={{ mode: "create" }}
      fields={config.create?.fields}
      values={values}
      isPending={false}
      error={null}
      onValueChange={(key, value) => setValues((prev) => ({ ...prev, [key]: value }))}
      onSubmit={() => onSubmit(values)}
      onClose={() => {}}
    />
  );
}

describe("ResourceEditorDialog image field", () => {
  afterEach(() => {
    cleanup();
  });

  it("fills the image URL from the uploader and keeps manual URL entry", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);

    const stub = screen.getByRole("button", { name: "업로드 스텁" });
    expect(stub).toHaveAttribute("data-upload-url", "/admin/v2/media/upload-url");

    await user.click(stub);
    expect(screen.getByLabelText("이미지")).toHaveValue("https://media.dopa.ing/banners/test.webp");

    await user.clear(screen.getByLabelText("이미지"));
    await user.type(screen.getByLabelText("이미지"), "https://cdn.example.com/manual.png");
    expect(screen.getByLabelText("이미지")).toHaveValue("https://cdn.example.com/manual.png");
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npx vitest run src/components/admin/resource-console/ResourceEditorDialog.test.tsx`
Expected: FAIL — no "업로드 스텁" button (the dialog renders a plain text input for the unknown type).

- [ ] **Step 7: Add the `image` type and the dialog branch**

`src/components/admin/resource-configs/types.ts` — replace the `Field` type with the one in **Interfaces** above (adds `"image"` and `upload?`).

`src/components/admin/resource-console/ResourceEditorDialog.tsx`:
- Add `import { PartyImageUploader } from "@/components/party-image-uploader";`
- Insert a new branch **before** the `field.options ?` branch:
  ```tsx
  ) : field.type === "image" && field.upload ? (
    <div className="grid gap-2">
      <PartyImageUploader
        mode="single"
        value={String(values[field.key] ?? "")}
        onChange={(url) => onValueChange(field.key, url)}
        uploadUrl={field.upload.url}
        hint={field.upload.hint}
        preview={field.upload.preview}
      />
      <Input
        id={`${config.key}-${field.key}`}
        type="url"
        placeholder="또는 이미지 URL 직접 입력 (https://…)"
        required={field.required}
        value={String(values[field.key] ?? "")}
        onChange={(event) => onValueChange(field.key, event.target.value)}
      />
    </div>
  ```
  The `<Label htmlFor>` above the field already targets `${config.key}-${field.key}`, so the URL input is the labelled control ("이미지").

- [ ] **Step 8: Run both tests, then the console suite**

Run: `npx vitest run src/components/admin/resource-console/ResourceEditorDialog.test.tsx src/components/party-image-uploader.test.tsx src/components/admin/AdminResourceConsole.test.tsx src/components/business-mobile/BusinessMobilePartyForm.test.tsx`
Expected: all PASS.

- [ ] **Step 9: Commit**

```bash
git add src/components/admin/resource-configs/types.ts src/components/party-image-uploader.tsx src/components/party-image-uploader.test.tsx src/components/admin/resource-console/ResourceEditorDialog.tsx src/components/admin/resource-console/ResourceEditorDialog.test.tsx
git commit -m "feat(admin): image field type for resource editors backed by the R2 uploader"
```
(append the two trailer lines).

---

### Task 2: Banner config (upload, schedule, action parity) and datetime round-trip

**Files:**
- Modify: `src/lib/format-date.ts` (add `toDateTimeLocalInputValue`)
- Modify: `src/lib/format-date.test.ts`
- Modify: `src/components/admin/AdminResourceConsole.tsx:38-44` (`initialValues`) and `:64-76` (`normalizeValues`) and the `submitEditor` call site (~line 226)
- Modify: `src/components/admin/resource-configs/content.ts:112-162` (`bannersConfig`)
- Modify: `src/components/admin/AdminResourceConsole.config.test.ts`
- Test: `src/components/admin/AdminResourceConsole.banners.test.tsx` (create)

**Interfaces:**
- Consumes: `Field.type === "image"` + `upload` (Task 1).
- Produces:
  ```ts
  // src/lib/format-date.ts
  export function toDateTimeLocalInputValue(value: unknown): string; // "" when empty/invalid
  // AdminResourceConsole.tsx
  function normalizeValues(fields: readonly Field[], values: Record<string, unknown>, mode: "create" | "edit"): Record<string, unknown>;
  ```

- [ ] **Step 1: Write the failing format-date test**

Append to `src/lib/format-date.test.ts` (keep existing imports; add `toDateTimeLocalInputValue` to the import list):

```ts
describe("toDateTimeLocalInputValue", () => {
  it("renders an ISO instant as the browser-local datetime-local value", () => {
    const local = new Date(2026, 8, 10, 12, 30); // 2026-09-10 12:30 in the test runner's zone
    expect(toDateTimeLocalInputValue(local.toISOString())).toBe("2026-09-10T12:30");
  });

  it("passes an already-local datetime-local string through unchanged", () => {
    expect(toDateTimeLocalInputValue("2026-09-10T12:30")).toBe("2026-09-10T12:30");
  });

  it("returns an empty string for empty, null and invalid input", () => {
    expect(toDateTimeLocalInputValue("")).toBe("");
    expect(toDateTimeLocalInputValue(null)).toBe("");
    expect(toDateTimeLocalInputValue("not a date")).toBe("");
    expect(toDateTimeLocalInputValue(true)).toBe("");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/format-date.test.ts`
Expected: FAIL — `toDateTimeLocalInputValue` is not exported.

- [ ] **Step 3: Implement the helper**

Append to `src/lib/format-date.ts`:

```ts
function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

/**
 * `<input type="datetime-local">` 값. 브라우저 로컬 시간 기준 `YYYY-MM-DDTHH:mm`.
 * 콘솔이 저장 시 `new Date(raw).toISOString()`으로 되돌리므로 같은 로컬 기준을 쓴다.
 */
export function toDateTimeLocalInputValue(value: unknown): string {
  if (typeof value !== "string" && typeof value !== "number" && !(value instanceof Date)) {
    return "";
  }
  if (value === "") return "";
  const date = toDate(value);
  if (!date) return "";
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}T${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}
```

- [ ] **Step 4: Run the format-date test to verify it passes**

Run: `npx vitest run src/lib/format-date.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing config test**

Append to `src/components/admin/AdminResourceConsole.config.test.ts` inside the existing `describe` (or a new `describe("banner resource config")`):

```ts
  it("uploads banner images, exposes the schedule and keeps action options in sync", () => {
    const banners = resourceConfigs.banners;
    const create = banners.create?.fields ?? [];
    const edit = banners.edit?.fields ?? [];

    expect(create.map((field) => field.key)).toEqual([
      "title", "imageUrl", "actionType", "actionValue", "linkUrl", "sortOrder", "isActive", "startsAt", "endsAt",
    ]);
    expect(edit.map((field) => field.key)).toEqual(create.map((field) => field.key));

    const image = create.find((field) => field.key === "imageUrl");
    expect(image).toMatchObject({
      type: "image",
      required: true,
      upload: {
        url: "/admin/v2/media/upload-url",
        hint: "jpeg/png/webp · 최대 10MB · 권장 1600×900 (16:9)",
        preview: "wide",
      },
    });

    const options = ["NONE", "DEEPLINK", "WEB", "INSTAGRAM", "YOUTUBE", "PHONE", "EMAIL", "CUSTOM"];
    expect(create.find((field) => field.key === "actionType")?.options).toEqual(options);
    expect(edit.find((field) => field.key === "actionType")?.options).toEqual(options);

    expect(create.find((field) => field.key === "startsAt")).toMatchObject({ label: "노출 시작", type: "datetime" });
    expect(edit.find((field) => field.key === "endsAt")).toMatchObject({ label: "노출 종료", type: "datetime" });
  });
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npx vitest run src/components/admin/AdminResourceConsole.config.test.ts`
Expected: FAIL on the field-key list (no `startsAt`/`endsAt`), then on `type: "image"`.

- [ ] **Step 7: Rewrite `bannersConfig`**

In `src/components/admin/resource-configs/content.ts` replace the `bannersConfig` block with:

```ts
const BANNER_ACTION_TYPES = [
  "NONE", "DEEPLINK", "WEB", "INSTAGRAM", "YOUTUBE", "PHONE", "EMAIL", "CUSTOM",
] as const;

const bannerImageField: Field = {
  key: "imageUrl",
  label: "이미지",
  type: "image",
  required: true,
  upload: {
    url: "/admin/v2/media/upload-url",
    hint: "jpeg/png/webp · 최대 10MB · 권장 1600×900 (16:9)",
    preview: "wide",
  },
};

const bannerScheduleFields: readonly Field[] = [
  { key: "startsAt", label: "노출 시작", type: "datetime" },
  { key: "endsAt", label: "노출 종료", type: "datetime" },
];

export const bannersConfig: ResourceConfig = {
  key: "banners",
  title: "배너 관리",
  description: "앱 홈 상단 배너의 이미지, 노출 순서·기간과 액션을 관리합니다.",
  resource: "banners",
  columns: [
    { key: "title", label: "제목" },
    { key: "imageUrl", label: "이미지" },
    { key: "actionType", label: "액션" },
    { key: "sortOrder", label: "순서" },
    { key: "isActive", label: "활성" },
  ],
  create: {
    label: "배너 추가",
    path: "/admin/v2/banners",
    fields: [
      text("title", "제목", true),
      bannerImageField,
      { key: "actionType", label: "액션", options: BANNER_ACTION_TYPES, defaultValue: "NONE" },
      text("actionValue", "액션 값"),
      text("linkUrl", "링크 URL"),
      number("sortOrder", "순서"),
      { key: "isActive", label: "활성", type: "boolean", defaultValue: true },
      ...bannerScheduleFields,
    ],
  },
  edit: {
    path: (row) => `/admin/v2/banners/${encodeURIComponent(String(row.id))}`,
    fields: [
      text("title", "제목", true),
      bannerImageField,
      { key: "actionType", label: "액션", options: BANNER_ACTION_TYPES },
      text("actionValue", "액션 값"),
      text("linkUrl", "링크 URL"),
      number("sortOrder", "순서"),
      { key: "isActive", label: "활성", type: "boolean" },
      ...bannerScheduleFields,
    ],
  },
  actions: [
    {
      label: "삭제",
      path: (row) => `/admin/v2/banners/${encodeURIComponent(String(row.id))}`,
      method: "DELETE",
      destructive: true,
    },
  ],
};
```
Import `Field` from `./types` if `content.ts` does not already import it.

- [ ] **Step 8: Run the config test to verify it passes**

Run: `npx vitest run src/components/admin/AdminResourceConsole.config.test.ts`
Expected: PASS.

- [ ] **Step 9: Write the failing console round-trip test**

Create `src/components/admin/AdminResourceConsole.banners.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const navigation = vi.hoisted(() => ({
  pathname: "/super-admin/banners",
  params: new URLSearchParams(),
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ replace: navigation.replace }),
  useSearchParams: () => navigation.params,
}));

vi.mock("@/auth/api/admin-resources.api", () => ({
  listAdminResources: vi.fn(),
  mutateAdminResource: vi.fn(),
}));

vi.mock("@/components/party-image-uploader", () => ({
  PartyImageUploader: (props: { onChange: (url: string) => void }) => (
    <button type="button" onClick={() => props.onChange("https://media.dopa.ing/banners/new.webp")}>
      업로드 스텁
    </button>
  ),
}));

import { listAdminResources, mutateAdminResource } from "@/auth/api/admin-resources.api";
import { AdminResourceConsole, resourceConfigs } from "@/components/admin/AdminResourceConsole";

const bannerRow = {
  id: "ban-1",
  title: "메인 배너",
  imageUrl: "https://media.dopa.ing/banners/a.webp",
  actionType: "INSTAGRAM",
  actionValue: "dopa.official",
  linkUrl: null,
  sortOrder: 0,
  isActive: true,
  startsAt: "2026-09-10T03:00:00.000Z",
  endsAt: null,
};

function renderBanners() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <AdminResourceConsole config={resourceConfigs.banners} />
    </QueryClientProvider>,
  );
}

describe("AdminResourceConsole banners", () => {
  beforeEach(() => {
    navigation.params = new URLSearchParams();
    navigation.replace.mockReset();
    vi.mocked(listAdminResources).mockReset();
    vi.mocked(mutateAdminResource).mockReset();
    vi.mocked(listAdminResources).mockResolvedValue({
      items: [bannerRow],
      nextCursor: null,
      asOf: "2026-09-08T00:00:00.000Z",
    });
    vi.mocked(mutateAdminResource).mockResolvedValue({ id: "ban-1" });
  });

  afterEach(() => {
    cleanup();
    document.body.replaceChildren();
  });

  it("creates a banner from an uploaded image", async () => {
    const user = userEvent.setup();
    renderBanners();
    await screen.findByText("배너 관리");

    await user.click(screen.getByRole("button", { name: "배너 추가" }));
    await user.type(screen.getByLabelText("제목"), "가을 파티");
    await user.click(screen.getByRole("button", { name: "업로드 스텁" }));
    expect(screen.getByLabelText("이미지")).toHaveValue("https://media.dopa.ing/banners/new.webp");
    await user.click(screen.getByRole("button", { name: "저장" }));

    expect(mutateAdminResource).toHaveBeenCalledWith(
      "/admin/v2/banners",
      "POST",
      expect.objectContaining({
        title: "가을 파티",
        imageUrl: "https://media.dopa.ing/banners/new.webp",
        actionType: "NONE",
        sortOrder: 0,
        isActive: true,
      }),
    );
    const body = vi.mocked(mutateAdminResource).mock.calls[0]?.[2] as Record<string, unknown>;
    expect(body).not.toHaveProperty("startsAt");
    expect(body).not.toHaveProperty("endsAt");
  });

  it("round-trips the schedule and keeps the full action list on edit", async () => {
    const user = userEvent.setup();
    renderBanners();
    await screen.findByText("메인 배너");

    await user.click(screen.getAllByRole("button", { name: /수정/ })[0]);
    expect(await screen.findByRole("heading", { name: "배너 관리 수정" })).toBeInTheDocument();
    expect(screen.getByLabelText("액션")).toHaveValue("INSTAGRAM");
    expect(screen.getByLabelText("노출 시작")).toHaveValue(
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
    );

    await user.clear(screen.getByLabelText("노출 시작"));
    await user.click(screen.getByRole("button", { name: "저장" }));

    expect(mutateAdminResource).toHaveBeenCalledWith(
      "/admin/v2/banners/ban-1",
      "PATCH",
      expect.objectContaining({ actionType: "INSTAGRAM", startsAt: null, endsAt: null }),
    );
  });
});
```

If the edit button has a different accessible name, look at `src/components/admin/resource-console/ResourceRowActions.tsx` and use that name; if `toHaveValue(expect.stringMatching(...))` is not supported by the installed jest-dom, read the value with `(screen.getByLabelText("노출 시작") as HTMLInputElement).value` and assert with `toMatch`.

- [ ] **Step 10: Run it to verify it fails**

Run: `npx vitest run src/components/admin/AdminResourceConsole.banners.test.tsx`
Expected: the create case passes once Task 2 Step 7 is in; the edit case FAILS — `노출 시작` holds the raw ISO string (`datetime-local` shows empty) and `startsAt` is absent from the PATCH body.

- [ ] **Step 11: Fix `initialValues` and `normalizeValues`**

In `src/components/admin/AdminResourceConsole.tsx`:
- Add `import { toDateTimeLocalInputValue } from "@/lib/format-date";`
- Replace `initialValues` with:
  ```ts
  function initialValues(fields: readonly Field[], row?: AdminResource): Record<string, unknown> {
    return Object.fromEntries(
      fields.map((field) => {
        const raw = row?.[field.key] ?? field.defaultValue ?? (field.type === "boolean" ? false : "");
        return [field.key, field.type === "datetime" ? toDateTimeLocalInputValue(raw) : raw];
      }),
    );
  }
  ```
- Replace `normalizeValues` with:
  ```ts
  function normalizeValues(
    fields: readonly Field[],
    values: Record<string, unknown>,
    mode: "create" | "edit",
  ) {
    const result: Record<string, unknown> = {};
    for (const field of fields) {
      const raw = values[field.key];
      if (raw === "" && !field.required) {
        // 수정 모드에서 비운 일정 필드는 해제(null)로 보낸다 — 서버 patch 스키마가 nullish를 받는다.
        if (mode === "edit" && field.type === "datetime") result[field.key] = null;
        continue;
      }
      if (field.type === "number") result[field.key] = Number(raw);
      else if (field.type === "boolean") result[field.key] = Boolean(raw);
      else if (field.type === "datetime" && typeof raw === "string") {
        result[field.key] = new Date(raw).toISOString();
      } else result[field.key] = raw;
    }
    return result;
  }
  ```
- In `submitEditor`, call `normalizeValues(fields, values, editor.mode)`.

- [ ] **Step 12: Run the banner console test, then the full console suites**

Run: `npx vitest run src/components/admin/AdminResourceConsole.banners.test.tsx src/components/admin/AdminResourceConsole.test.tsx src/components/admin/AdminResourceConsole.config.test.ts src/lib/format-date.test.ts`
Expected: all PASS.

- [ ] **Step 13: Commit**

```bash
git add src/lib/format-date.ts src/lib/format-date.test.ts src/components/admin/AdminResourceConsole.tsx src/components/admin/resource-configs/content.ts src/components/admin/AdminResourceConsole.config.test.ts src/components/admin/AdminResourceConsole.banners.test.tsx
git commit -m "feat(admin): banner upload field, schedule fields and edit action parity"
```
(append the two trailer lines).

---

### Task 3: CSP for direct R2 PUT, list thumbnails, operations note

**Files:**
- Modify: `src/lib/security-headers.ts:9-21` (`PRODUCTION_CONNECT_SOURCES`)
- Modify: `public/_headers` (the `Content-Security-Policy` line, `connect-src` list)
- Modify: `src/lib/security-headers.test.ts`
- Modify: `src/components/admin/resource-console/formatters.tsx:95-118` (`renderResourceValue`)
- Modify: `src/components/admin/resource-console/formatters.test.tsx`
- Modify: `docs/OPERATIONS.md` (admin resources paragraph near line 84)

**Interfaces:** none new.

- [ ] **Step 1: Write the failing CSP test**

Append to `src/lib/security-headers.test.ts` inside the top-level `describe`:

```ts
  it("allows the direct R2 upload endpoint used by admin image uploads", () => {
    expect(CONTENT_SECURITY_POLICY).toMatch(
      /connect-src[^;]*https:\/\/8c676e7121f390b03c3af9a59a9445ca\.r2\.cloudflarestorage\.com/,
    );
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/security-headers.test.ts`
Expected: FAIL on the new case only.

- [ ] **Step 3: Add the host in both places**

`src/lib/security-headers.ts` — in `PRODUCTION_CONNECT_SOURCES`, after `"https://analyticsdata.googleapis.com",` add:
```ts
  // 배너 이미지 업로드: presign 응답의 S3 PUT URL. 워커 티켓 경로는 api.dopa.ing이라 이미 허용된다.
  "https://8c676e7121f390b03c3af9a59a9445ca.r2.cloudflarestorage.com",
```
`public/_headers` — in the `connect-src` list, insert ` https://8c676e7121f390b03c3af9a59a9445ca.r2.cloudflarestorage.com` immediately after `https://analyticsdata.googleapis.com` (same order as the TS array; the test compares the full policy string).

- [ ] **Step 4: Run the CSP tests to verify they pass**

Run: `npx vitest run src/lib/security-headers.test.ts`
Expected: PASS, including "publishes the same policy on static assets".

- [ ] **Step 5: Write the failing thumbnail test**

Append to `src/components/admin/resource-console/formatters.test.tsx` (add `render`/`screen` from `@testing-library/react` and `renderResourceValue` to the imports):

```tsx
  it("renders image URLs as thumbnails and other strings as text", () => {
    render(<>{renderResourceValue("https://media.dopa.ing/banners/a.webp", "imageUrl")}</>);
    const image = document.querySelector("img");
    expect(image).toHaveAttribute("src", "https://media.dopa.ing/banners/a.webp");
    expect(image).toHaveAttribute("title", "https://media.dopa.ing/banners/a.webp");

    render(<>{renderResourceValue("not-a-url", "imageUrl")}</>);
    expect(screen.getByText("not-a-url")).toBeInTheDocument();
  });
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npx vitest run src/components/admin/resource-console/formatters.test.tsx`
Expected: FAIL — no `<img>` rendered.

- [ ] **Step 7: Render thumbnails**

In `src/components/admin/resource-console/formatters.tsx` `renderResourceValue`, insert before the `const text = formatResourceText(value, key);` line:

```tsx
  if (key === "imageUrl" && typeof value === "string" && /^https?:\/\//.test(value)) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- 운영 썸네일, 원격 호스트가 가변이라 next/image 미사용
      <img
        src={value}
        alt=""
        title={value}
        className="h-10 w-auto max-w-24 rounded border object-cover"
      />
    );
  }
```

- [ ] **Step 8: Run the formatter tests, then lint**

Run: `npx vitest run src/components/admin/resource-console/formatters.test.tsx && npm run lint`
Expected: PASS and lint clean (if the eslint disable comment format differs from the repo's other `no-img-element` suppressions — see `src/components/party-image-uploader.tsx` — match that style).

- [ ] **Step 9: Document the operator flow**

In `docs/OPERATIONS.md`, directly after the paragraph around line 84 that lists 알림 캠페인·배너·파티 카테고리, add:

```md
배너 이미지는 "배너 추가/수정" 다이얼로그에서 파일을 직접 올린다(SUPER_ADMIN 전용 `POST /admin/v2/media/upload-url` → R2 `banners/` → `https://media.dopa.ing/banners/…`). 권장 크기 1600×900(16:9), jpeg/png/webp 10MB 이하, 업로드 전 브라우저가 1920px로 리사이즈한다. 외부 호스팅 이미지는 URL 직접 입력으로도 저장할 수 있다. 노출 시작/종료를 비우면 무제한 노출이며, 수정 화면에서 비우면 일정이 해제된다.
```

- [ ] **Step 10: Run the full gate**

Run: `npm run verify`
Expected: vitest, release scripts, runtime-boundary check, eslint and the OpenNext build all pass.

- [ ] **Step 11: Commit**

```bash
git add src/lib/security-headers.ts public/_headers src/lib/security-headers.test.ts src/components/admin/resource-console/formatters.tsx src/components/admin/resource-console/formatters.test.tsx docs/OPERATIONS.md
git commit -m "feat(admin): allow direct R2 uploads in CSP, banner thumbnails and operator docs"
```
(append the two trailer lines).
