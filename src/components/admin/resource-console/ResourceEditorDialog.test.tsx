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

    // exact: false — the field is required, so the label also carries a visually
    // hidden " *" marker (`<span aria-hidden>`); @testing-library/dom's label-text
    // matcher reads the label's full text content (unlike getByRole's accessible-name
    // computation), so an exact "이미지" query never matches "이미지 *".
    await user.click(stub);
    expect(screen.getByLabelText("이미지", { exact: false })).toHaveValue(
      "https://media.dopa.ing/banners/test.webp",
    );

    await user.clear(screen.getByLabelText("이미지", { exact: false }));
    await user.type(screen.getByLabelText("이미지", { exact: false }), "https://cdn.example.com/manual.png");
    expect(screen.getByLabelText("이미지", { exact: false })).toHaveValue(
      "https://cdn.example.com/manual.png",
    );
  });
});
