"use client";

import {
  useMemo,
  useState,
  type FormEvent,
} from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  Archive,
  ArrowLeft,
  Download,
  FileText,
  Forward,
  Inbox,
  LoaderCircle,
  Mail,
  MailOpen,
  Menu,
  MoreHorizontal,
  Paperclip,
  Pencil,
  RefreshCw,
  Reply,
  RotateCcw,
  Search,
  Send,
  ShieldAlert,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  composeMail,
  downloadMailAttachment,
  fetchMailbox,
  fetchMailMessage,
  listMailMessages,
  patchMailMessage,
  retryMailMessage,
  type MailAddress,
  type MailDeliveryStatus,
  type MailFolder,
  type MailMessage,
  type MailMessageDetail,
} from "@/auth/api/admin-mail.api";
import { adminQueryKeys } from "@/auth/model/admin-query-keys";
import { MailRichTextEditor } from "@/components/mail/MailRichTextEditor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const MAX_ATTACHMENT_BYTES = 3 * 1024 * 1024;

const folders: readonly {
  id: MailFolder;
  label: string;
  icon: typeof Inbox;
}[] = [
  { id: "INBOX", label: "받은편지함", icon: Inbox },
  { id: "SENT", label: "보낸편지함", icon: Send },
  { id: "ARCHIVE", label: "보관함", icon: Archive },
  { id: "SPAM", label: "스팸", icon: ShieldAlert },
  { id: "TRASH", label: "휴지통", icon: Trash2 },
];

const dateFormatter = new Intl.DateTimeFormat("ko-KR", {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const fullDateFormatter = new Intl.DateTimeFormat("ko-KR", {
  year: "numeric",
  month: "long",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function displayAddress(address: MailAddress | undefined): string {
  if (!address) return "알 수 없는 발신자";
  return address.name.trim() || address.address;
}

function addressLine(addresses: readonly MailAddress[]): string {
  return addresses
    .map((item) => (item.name ? `${item.name} <${item.address}>` : item.address))
    .join(", ");
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const statusLabels: Record<MailDeliveryStatus, string> = {
  QUEUED: "전송 대기",
  ACCEPTED: "전송 접수",
  DELIVERED: "배달 완료",
  BOUNCED: "반송",
  FAILED: "전송 실패",
  UNKNOWN: "결과 확인 필요",
};

function DeliveryBadge({ status }: { status: MailDeliveryStatus }) {
  const variant =
    status === "FAILED" || status === "BOUNCED"
      ? "destructive"
      : status === "DELIVERED"
        ? "default"
        : "secondary";
  return (
    <Badge
      variant={variant}
      className={cn(status === "UNKNOWN" && "bg-amber-100 text-amber-900")}
    >
      {statusLabels[status]}
    </Badge>
  );
}

function splitRecipients(value: string): MailAddress[] {
  return value
    .split(/[;,]/u)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const match = part.match(/^\s*"?([^"<>]*)"?\s*<([^<>]+)>\s*$/u);
      return match
        ? { name: match[1]?.trim() ?? "", address: match[2]?.trim() ?? "" }
        : { name: "", address: part };
    });
}

type ComposeMode = "new" | "reply" | "forward" | "attach";

function composeSubject(mode: ComposeMode, message: MailMessage | null): string {
  if (!message) return "";
  if (mode === "reply") {
    return /^\s*re\s*:/iu.test(message.subject) ? message.subject : `Re: ${message.subject}`;
  }
  if (mode === "forward" || mode === "attach") {
    return /^\s*(?:fw|fwd)\s*:/iu.test(message.subject)
      ? message.subject
      : `Fwd: ${message.subject}`;
  }
  return "";
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function textAsHtml(value: string): string {
  const paragraphs = value.split(/\n{2,}/u);
  return paragraphs
    .map((paragraph) => `<p>${escapeHtml(paragraph).replaceAll("\n", "<br>") || "<br>"}</p>`)
    .join("");
}

function forwardedHtml(detail: MailMessageDetail | null): string {
  const message = detail?.message;
  if (!message) return "<p></p>";
  const body = detail?.text || message.snippet;
  return [
    "<p><br></p>",
    "<hr>",
    "<p><strong>전달된 메일</strong><br>",
    `보낸 사람: ${escapeHtml(addressLine(message.from))}<br>`,
    `날짜: ${escapeHtml(fullDateFormatter.format(message.activityAt))}<br>`,
    `제목: ${escapeHtml(message.subject)}<br>`,
    `받는 사람: ${escapeHtml(addressLine(message.to))}</p>`,
    `<blockquote>${textAsHtml(body)}</blockquote>`,
  ].join("");
}

function normalizeAddress(value: string): string {
  return value.trim().toLowerCase();
}

function replySenderAddress(
  mode: ComposeMode,
  message: MailMessage | null,
  senders: readonly MailAddress[],
  mailboxAddress: string,
): string {
  if (mode !== "reply" || message === null) return mailboxAddress;
  const allowed = new Map(
    senders.map((sender) => [normalizeAddress(sender.address), sender.address]),
  );
  const candidates = message.direction === "INBOUND" ? message.to : message.from;
  for (const candidate of candidates) {
    const owned = allowed.get(normalizeAddress(candidate.address));
    if (owned) return owned;
  }
  return mailboxAddress;
}

function ComposeDialog({
  open,
  mode,
  detail,
  mailboxAddress,
  senders,
  onOpenChange,
  onSent,
}: {
  open: boolean;
  mode: ComposeMode;
  detail: MailMessageDetail | null;
  mailboxAddress: string;
  senders: readonly MailAddress[];
  onOpenChange: (open: boolean) => void;
  onSent: (message: MailMessage | null) => void;
}) {
  const source = detail?.message ?? null;
  const senderAddresses = new Set(
    senders.map((sender) => normalizeAddress(sender.address)),
  );
  const replyTarget =
    mode === "reply" && source
      ? source.direction === "INBOUND"
        ? source.from.find(
            (address) => !senderAddresses.has(normalizeAddress(address.address)),
          )
        : source.to.at(0)
      : undefined;
  const defaultFromAddress = replySenderAddress(
    mode,
    source,
    senders,
    mailboxAddress,
  );
  const [fromAddress, setFromAddress] = useState(defaultFromAddress);
  // Falls back to a sender that is actually in the list, not to the mailbox
  // address. The <select> is controlled by this value: an address absent from
  // `senders` leaves selectedIndex at -1, and the dropdown then either blocks
  // submit on a blank-looking required field or shows one address while the
  // form posts another.
  const effectiveFromAddress =
    senders.find(
      (sender) => normalizeAddress(sender.address) === normalizeAddress(fromAddress),
    )?.address ??
    senders[0]?.address ??
    defaultFromAddress;
  const [to, setTo] = useState(replyTarget?.address ?? "");
  const [cc, setCc] = useState("");
  const [bcc, setBcc] = useState("");
  const [subject, setSubject] = useState(composeSubject(mode, source));
  const initialHtml = mode === "forward" ? forwardedHtml(detail) : "<p></p>";
  const [text, setText] = useState("");
  const [html, setHtml] = useState(initialHtml);
  const [files, setFiles] = useState<File[]>([]);
  const [attachedMessageIds, setAttachedMessageIds] = useState<string[]>(
    mode === "attach" && source ? [source.id] : [],
  );

  const sendMutation = useMutation({
    mutationFn: composeMail,
    onSuccess: (result) => {
      toast.success("메일을 전송 대기열에 넣었습니다.");
      onSent(result.message);
      onOpenChange(false);
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "메일을 보내지 못했습니다."),
  });

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsedTo = splitRecipients(to);
    const parsedCc = splitRecipients(cc);
    const parsedBcc = splitRecipients(bcc);
    const all = [...parsedTo, ...parsedCc, ...parsedBcc];
    if (all.length === 0 || all.some((item) => !item.address.includes("@"))) {
      toast.error("올바른 수신자 주소를 입력해 주세요.");
      return;
    }
    if (all.length > 50) {
      toast.error("To, Cc, Bcc 수신자는 합계 50명까지 가능합니다.");
      return;
    }
    if (files.length + attachedMessageIds.length > 32) {
      toast.error("첨부파일은 32개까지 가능합니다.");
      return;
    }
    if (files.reduce((sum, file) => sum + file.size, 0) > MAX_ATTACHMENT_BYTES) {
      toast.error("첨부파일 원본 합계는 3MB까지 가능합니다.");
      return;
    }
    if (!text.trim()) {
      toast.error("메일 본문을 입력해 주세요.");
      return;
    }
    const form = new FormData();
    form.set("fromAddress", effectiveFromAddress);
    form.set("to", JSON.stringify(parsedTo));
    form.set("cc", JSON.stringify(parsedCc));
    form.set("bcc", JSON.stringify(parsedBcc));
    form.set("subject", subject);
    form.set("text", text);
    form.set("html", html);
    form.set("attachedMessageIds", JSON.stringify(attachedMessageIds));
    if (mode === "reply" && source) form.set("replyToMessageId", source.id);
    if (mode === "forward" && source) form.set("forwardOfMessageId", source.id);
    for (const file of files) form.append("attachments", file, file.name);
    sendMutation.mutate(form);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
        <form onSubmit={onSubmit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>
              {mode === "reply"
                ? "답장"
                : mode === "forward"
                  ? "전달"
                  : mode === "attach"
                    ? "메일 첨부하여 보내기"
                    : "새 메일"}
            </DialogTitle>
            <DialogDescription>
              이 사서함에 허용된 주소만 발신자로 선택할 수 있습니다.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3">
            <label className="grid gap-1 text-xs font-medium">
              보내는 사람
              <select
                value={effectiveFromAddress}
                onChange={(event) => setFromAddress(event.target.value)}
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={senders.length <= 1}
                required
              >
                {senders.map((sender) => (
                  <option key={sender.address} value={sender.address}>
                    {sender.name
                      ? `${sender.name} <${sender.address}>`
                      : sender.address}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-xs font-medium">
              받는 사람
              <Input
                value={to}
                onChange={(event) => setTo(event.target.value)}
                placeholder="name@example.com, other@example.com"
                autoFocus
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-xs font-medium">
                참조 (Cc)
                <Input value={cc} onChange={(event) => setCc(event.target.value)} />
              </label>
              <label className="grid gap-1 text-xs font-medium">
                숨은 참조 (Bcc)
                <Input value={bcc} onChange={(event) => setBcc(event.target.value)} />
              </label>
            </div>
            <label className="grid gap-1 text-xs font-medium">
              제목
              <Input
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                maxLength={998}
              />
            </label>
            <div className="grid gap-1 text-xs font-medium">
              <span>메일 본문</span>
              <MailRichTextEditor
                initialHtml={initialHtml}
                onChange={(value) => {
                  setHtml(value.html);
                  setText(value.text);
                }}
              />
              <span className="font-normal text-muted-foreground">
                서식 HTML은 서버에서 다시 정화되며 외부 이미지는 제거됩니다.
              </span>
            </div>
            <label className="grid gap-1 text-xs font-medium">
              첨부파일 · `.eml` 포함 최대 32개, 원본 합계 3MB
              <Input
                type="file"
                multiple
                onChange={(event) =>
                  setFiles((current) => [
                    ...current,
                    ...Array.from(event.target.files ?? []),
                  ])
                }
              />
            </label>
            {files.length > 0 || attachedMessageIds.length > 0 ? (
              <div className="grid gap-2 rounded-lg border bg-muted/20 p-2">
                {source && attachedMessageIds.includes(source.id) ? (
                  <div className="flex min-w-0 items-center gap-2 rounded-md bg-background px-2 py-1.5 text-xs">
                    <Mail className="size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">
                      {source.subject || "제목 없음"}.eml · 원본 메일
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      aria-label="첨부 메일 제거"
                      onClick={() => setAttachedMessageIds([])}
                    >
                      <X />
                    </Button>
                  </div>
                ) : null}
                {files.map((file, index) => (
                  <div
                    key={`${file.name}-${file.lastModified}-${index}`}
                    className="flex min-w-0 items-center gap-2 rounded-md bg-background px-2 py-1.5 text-xs"
                  >
                    <FileText className="size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">
                      {file.name} · {formatBytes(file.size)}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      aria-label={`${file.name} 첨부 제거`}
                      onClick={() =>
                        setFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))
                      }
                    >
                      <X />
                    </Button>
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              취소
            </Button>
            <Button type="submit" disabled={sendMutation.isPending}>
              {sendMutation.isPending ? <LoaderCircle className="animate-spin" /> : <Send />}
              보내기
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function MailListItem({
  message,
  selected,
  onSelect,
}: {
  message: MailMessage;
  selected: boolean;
  onSelect: () => void;
}) {
  const counterpart = message.direction === "INBOUND" ? message.from.at(0) : message.to.at(0);
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "grid w-full gap-1 border-b px-4 py-3 text-left transition-colors hover:bg-muted/60",
        selected && "bg-primary/8",
        !message.isRead && "bg-blue-50/70 dark:bg-blue-950/20",
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        {!message.isRead ? <span className="size-2 shrink-0 rounded-full bg-blue-500" /> : null}
        <span className={cn("truncate text-sm", !message.isRead && "font-semibold")}>
          {displayAddress(counterpart)}
        </span>
        <time className="ml-auto shrink-0 text-[11px] text-muted-foreground">
          {dateFormatter.format(message.activityAt)}
        </time>
      </div>
      <div className="flex min-w-0 items-center gap-1.5">
        <span className={cn("truncate text-sm", !message.isRead && "font-semibold")}>
          {message.subject || "(제목 없음)"}
        </span>
        {(message.messageCount ?? 1) > 1 ? (
          <span className="shrink-0 text-xs text-muted-foreground">{message.messageCount}</span>
        ) : null}
        {message.hasAttachments ? <Paperclip className="size-3 shrink-0 text-muted-foreground" /> : null}
      </div>
      <p className="line-clamp-2 text-xs leading-5 text-muted-foreground">{message.snippet}</p>
      {message.direction === "OUTBOUND" ? (
        <div className="pt-1">
          <DeliveryBadge status={message.deliveryStatus} />
        </div>
      ) : null}
    </button>
  );
}

export function MailConsole({ compact = false }: { compact?: boolean }) {
  const queryClient = useQueryClient();
  const [folder, setFolder] = useState<MailFolder>("INBOX");
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobilePane, setMobilePane] = useState<"folders" | "list" | "detail">("list");
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeMode, setComposeMode] = useState<ComposeMode>("new");

  const mailbox = useQuery({
    queryKey: adminQueryKeys.mail.mailbox,
    queryFn: fetchMailbox,
    refetchInterval: 30_000,
  });
  const listParams = useMemo(
    () => ({ folder, query: search || undefined, unread: unreadOnly || undefined }),
    [folder, search, unreadOnly],
  );
  const messages = useInfiniteQuery({
    queryKey: adminQueryKeys.mail.list(listParams),
    queryFn: ({ pageParam }) =>
      listMailMessages({ ...listParams, cursor: pageParam, limit: 40 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const items = messages.data?.pages.flatMap((page) => page.items) ?? [];
  const detail = useQuery({
    queryKey: adminQueryKeys.mail.detail(selectedId ?? "none"),
    queryFn: () => fetchMailMessage(selectedId as string),
    enabled: selectedId !== null,
  });

  const invalidateMail = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.mail.mailbox }),
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.mail.all }),
    ]);
  };

  const stateMutation = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: { isRead?: boolean; folder?: MailFolder } }) =>
      patchMailMessage(id, patch),
    onSuccess: async (result, variables) => {
      queryClient.setQueryData<MailMessageDetail>(
        adminQueryKeys.mail.detail(result.message.id),
        (current) => (current ? { ...current, message: result.message } : current),
      );
      await invalidateMail();
      if (variables.patch.folder !== undefined && variables.patch.folder !== folder) {
        setSelectedId(null);
        setMobilePane("list");
      }
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "메일 상태를 바꾸지 못했습니다."),
  });

  const retryMutation = useMutation({
    mutationFn: (id: string) => retryMailMessage(id),
    onSuccess: async () => {
      toast.success("메일을 다시 전송 대기열에 넣었습니다.");
      await invalidateMail();
      if (selectedId) {
        await queryClient.invalidateQueries({ queryKey: adminQueryKeys.mail.detail(selectedId) });
      }
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "재시도하지 못했습니다."),
  });

  const selectMessage = (message: MailMessage) => {
    setSelectedId(message.id);
    setMobilePane("detail");
    if (!message.isRead) stateMutation.mutate({ id: message.id, patch: { isRead: true } });
  };

  const selectFolder = (next: MailFolder) => {
    setFolder(next);
    setSelectedId(null);
    setMobilePane("list");
  };

  const openComposer = (mode: ComposeMode) => {
    setComposeMode(mode);
    setComposeOpen(true);
  };

  const folderCounts = new Map(
    mailbox.data?.folders.map((entry) => [entry.folder, entry]) ?? [],
  );
  return (
    <div
      className={cn(
        "min-h-0 bg-background",
        compact
          ? "h-[calc(100dvh-4rem)]"
          : "h-[calc(100dvh-3.5rem)] md:h-full",
      )}
      data-mail-layout={compact ? "compact" : "responsive"}
    >
      <div
        className={cn(
          "grid h-full min-h-0",
          !compact &&
            "md:grid-cols-[210px_360px_minmax(0,1fr)] xl:grid-cols-[230px_400px_minmax(0,1fr)]",
        )}
      >
        <aside
          className={cn(
            "min-h-0 flex-col border-r bg-muted/20",
            mobilePane === "folders" ? "flex" : "hidden",
            !compact && "md:flex",
          )}
        >
          <div className="border-b p-4">
            <Button
              className="w-full justify-start"
              size="lg"
              // `senders` is served by the backend and was added after this
              // console shipped, so a deploy that lands the web app first — or
              // a rollback — answers without it. `?.senders.length` reads
              // `undefined.length` and takes the whole mail console down with a
              // render error, which is a blank screen for a missing button.
              disabled={(mailbox.data?.senders?.length ?? 0) === 0}
              onClick={() => openComposer("new")}
            >
              <Pencil /> 새 메일
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {folders.map((entry) => {
              const count = folderCounts.get(entry.id);
              return (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => selectFolder(entry.id)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm transition-colors",
                    folder === entry.id
                      ? "bg-primary/10 font-medium text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <entry.icon className="size-4" />
                  {entry.label}
                  <span className="ml-auto text-xs tabular-nums">
                    {count?.unread ? `${count.unread} / ` : ""}
                    {count?.total ?? 0}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="border-t p-4 text-xs text-muted-foreground">
            <p className="truncate font-medium text-foreground">
              {mailbox.data?.address ?? "사서함 확인 중"}
            </p>
            <p className="mt-1">외부 이미지는 기본 차단됩니다.</p>
          </div>
        </aside>

        <section
          className={cn(
            "min-h-0 flex-col border-r bg-background",
            mobilePane === "list" ? "flex" : "hidden",
            !compact && "md:flex",
          )}
        >
          <div className="grid gap-3 border-b p-3">
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className={cn(!compact && "md:hidden")}
                onClick={() => setMobilePane("folders")}
                aria-label="폴더 목록"
              >
                <Menu />
              </Button>
              <h1 className="truncate font-semibold">
                {folders.find((entry) => entry.id === folder)?.label}
              </h1>
              <Button
                type="button"
                variant={unreadOnly ? "secondary" : "ghost"}
                size="sm"
                className="ml-auto"
                onClick={() => setUnreadOnly((value) => !value)}
              >
                {unreadOnly ? <MailOpen /> : <Mail />} 안읽음
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => void messages.refetch()}
                aria-label="목록 새로고침"
              >
                <RefreshCw className={cn(messages.isFetching && "animate-spin")} />
              </Button>
            </div>
            <form
              className="relative"
              onSubmit={(event) => {
                event.preventDefault();
                setSearch(searchDraft.trim());
                setSelectedId(null);
              }}
            >
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchDraft}
                onChange={(event) => setSearchDraft(event.target.value)}
                className="pl-8 pr-8"
                placeholder="제목, 주소, 본문 검색"
                aria-label="메일 검색"
              />
              {searchDraft ? (
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
                  onClick={() => {
                    setSearchDraft("");
                    setSearch("");
                  }}
                  aria-label="검색 지우기"
                >
                  <X className="size-4" />
                </button>
              ) : null}
            </form>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {messages.isPending ? (
              <div className="grid place-items-center p-12 text-muted-foreground">
                <LoaderCircle className="animate-spin" />
              </div>
            ) : messages.isError ? (
              <div className="grid gap-3 p-8 text-center">
                <p className="text-sm">메일 목록을 불러오지 못했습니다.</p>
                <Button variant="outline" onClick={() => void messages.refetch()}>
                  다시 시도
                </Button>
              </div>
            ) : items.length === 0 ? (
              <div className="grid place-items-center gap-2 p-12 text-center text-muted-foreground">
                <MailOpen className="size-8" />
                <p className="text-sm">표시할 메일이 없습니다.</p>
              </div>
            ) : (
              items.map((message) => (
                <MailListItem
                  key={message.id}
                  message={message}
                  selected={message.id === selectedId}
                  onSelect={() => selectMessage(message)}
                />
              ))
            )}
            {messages.hasNextPage ? (
              <div className="p-3">
                <Button
                  variant="outline"
                  className="w-full"
                  disabled={messages.isFetchingNextPage}
                  onClick={() => void messages.fetchNextPage()}
                >
                  {messages.isFetchingNextPage ? <LoaderCircle className="animate-spin" /> : null}
                  더 보기
                </Button>
              </div>
            ) : null}
          </div>
        </section>

        <section
          className={cn(
            "min-h-0 flex-col bg-background",
            mobilePane === "detail" ? "flex" : "hidden",
            !compact && "md:flex",
          )}
        >
          {selectedId === null ? (
            <div className="grid h-full place-items-center text-muted-foreground">
              <div className="text-center">
                <Mail className="mx-auto mb-3 size-10 opacity-40" />
                <p className="text-sm">읽을 메일을 선택하세요.</p>
              </div>
            </div>
          ) : detail.isPending ? (
            <div className="grid h-full place-items-center text-muted-foreground">
              <LoaderCircle className="animate-spin" />
            </div>
          ) : detail.isError || !detail.data ? (
            <div className="grid h-full place-items-center gap-3 p-8 text-center">
              <p className="text-sm">메일을 불러오지 못했습니다.</p>
              <Button variant="outline" onClick={() => void detail.refetch()}>
                다시 시도
              </Button>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-1 border-b px-2 py-2 sm:px-3">
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn(!compact && "md:hidden")}
                  onClick={() => setMobilePane("list")}
                  aria-label="메일 목록으로"
                >
                  <ArrowLeft />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() =>
                    stateMutation.mutate({
                      id: detail.data.message.id,
                      patch: { isRead: !detail.data.message.isRead },
                    })
                  }
                  aria-label={detail.data.message.isRead ? "안읽음으로 표시" : "읽음으로 표시"}
                >
                  {detail.data.message.isRead ? <Mail /> : <MailOpen />}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() =>
                    stateMutation.mutate({ id: detail.data.message.id, patch: { folder: "ARCHIVE" } })
                  }
                  aria-label="보관"
                >
                  <Archive />
                </Button>
                {folder === "SPAM" ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      stateMutation.mutate({ id: detail.data.message.id, patch: { folder: "INBOX" } })
                    }
                  >
                    스팸 아님
                  </Button>
                ) : null}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() =>
                    stateMutation.mutate({ id: detail.data.message.id, patch: { folder: "TRASH" } })
                  }
                  aria-label="휴지통으로"
                >
                  <Trash2 />
                </Button>
                <div className="ml-auto flex items-center gap-1">
                  <Button variant="ghost" size="sm" onClick={() => openComposer("reply")}>
                    <Reply /> 답장
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => openComposer("forward")}>
                    <Forward /> 전달
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => openComposer("attach")}>
                    <Paperclip /> 메일 첨부
                  </Button>
                  <Button variant="ghost" size="icon" disabled aria-label="추가 작업">
                    <MoreHorizontal />
                  </Button>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto">
                <article className="mx-auto max-w-4xl p-4 sm:p-6 lg:p-8">
                  <div className="flex flex-wrap items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <h2 className="break-words text-xl font-semibold sm:text-2xl">
                        {detail.data.message.subject || "(제목 없음)"}
                      </h2>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <span className="font-medium">
                          {displayAddress(detail.data.message.from.at(0))}
                        </span>
                        <span className="break-all text-xs text-muted-foreground">
                          {detail.data.message.from.at(0)?.address}
                        </span>
                        <time className="ml-auto text-xs text-muted-foreground">
                          {fullDateFormatter.format(detail.data.message.activityAt)}
                        </time>
                      </div>
                      <p className="mt-1 break-all text-xs text-muted-foreground">
                        받는 사람: {addressLine(detail.data.message.to)}
                      </p>
                      {detail.data.message.cc.length > 0 ? (
                        <p className="mt-1 break-all text-xs text-muted-foreground">
                          참조: {addressLine(detail.data.message.cc)}
                        </p>
                      ) : null}
                      {detail.data.message.bcc.length > 0 ? (
                        <p className="mt-1 break-all text-xs text-muted-foreground">
                          숨은 참조: {addressLine(detail.data.message.bcc)}
                        </p>
                      ) : null}
                    </div>
                    {detail.data.message.direction === "OUTBOUND" ? (
                      <DeliveryBadge status={detail.data.message.deliveryStatus} />
                    ) : null}
                  </div>

                  {detail.data.message.lastErrorMessage ? (
                    <div className="mt-5 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
                      <p className="font-medium text-destructive">
                        {detail.data.message.lastErrorMessage}
                      </p>
                      {detail.data.message.lastErrorCode ? (
                        <p className="mt-1 font-mono text-xs text-muted-foreground">
                          {detail.data.message.lastErrorCode}
                        </p>
                      ) : null}
                      {detail.data.message.deliveryStatus === "FAILED" ||
                      detail.data.message.deliveryStatus === "UNKNOWN" ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="mt-3"
                          disabled={retryMutation.isPending}
                          onClick={() => retryMutation.mutate(detail.data.message.id)}
                        >
                          <RotateCcw /> 명시적으로 다시 보내기
                        </Button>
                      ) : null}
                    </div>
                  ) : null}

                  {detail.data.thread.length > 1 ? (
                    <div className="mt-5 flex gap-1 overflow-x-auto rounded-lg border bg-muted/30 p-2">
                      {detail.data.thread.map((threadMessage) => (
                        <button
                          type="button"
                          key={threadMessage.id}
                          className={cn(
                            "shrink-0 rounded-md px-3 py-1.5 text-xs hover:bg-background",
                            threadMessage.id === detail.data.message.id && "bg-background shadow-sm",
                          )}
                          onClick={() => selectMessage(threadMessage)}
                        >
                          {displayAddress(
                            threadMessage.direction === "INBOUND"
                              ? threadMessage.from.at(0)
                              : threadMessage.to.at(0),
                          )}
                          · {dateFormatter.format(threadMessage.activityAt)}
                        </button>
                      ))}
                    </div>
                  ) : null}

                  <div className="mt-8 min-h-48 border-t pt-6">
                    {detail.data.html ? (
                      <iframe
                        title="정화된 HTML 메일 본문"
                        sandbox=""
                        className="min-h-96 w-full border-0 bg-white"
                        srcDoc={`<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: cid:; style-src 'unsafe-inline'"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font-family:system-ui,sans-serif;margin:0;color:#111;overflow-wrap:anywhere}img{max-width:100%;height:auto}table{max-width:100%}</style></head><body>${detail.data.html}</body></html>`}
                      />
                    ) : (
                      <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-7">
                        {detail.data.text || "본문이 없습니다."}
                      </pre>
                    )}
                  </div>

                  {detail.data.attachments.length > 0 ? (
                    <div className="mt-8 border-t pt-5">
                      <h3 className="mb-3 flex items-center gap-2 text-sm font-medium">
                        <Paperclip className="size-4" /> 첨부파일 {detail.data.attachments.length}개
                      </h3>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {detail.data.attachments.map((attachment) => (
                          <button
                            key={attachment.id}
                            type="button"
                            className="flex min-w-0 items-center gap-3 rounded-lg border p-3 text-left hover:bg-muted/50"
                            onClick={() => {
                              void downloadMailAttachment(detail.data.message.id, attachment).catch(() =>
                                toast.error("첨부파일을 내려받지 못했습니다."),
                              );
                            }}
                          >
                            <FileText className="size-5 shrink-0 text-muted-foreground" />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium">
                                {attachment.filename}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {formatBytes(attachment.size)}
                              </span>
                            </span>
                            <Download className="size-4 shrink-0" />
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </article>
              </div>
            </>
          )}
        </section>
      </div>

      {composeOpen ? (
        <ComposeDialog
          open
          mode={composeMode}
          detail={detail.data ?? null}
          mailboxAddress={mailbox.data?.address ?? ""}
          senders={mailbox.data?.senders ?? []}
          onOpenChange={setComposeOpen}
          onSent={(message) => {
            void invalidateMail();
            if (message) {
              setFolder("SENT");
              setSelectedId(message.id);
              setMobilePane("detail");
              void queryClient.invalidateQueries({
                queryKey: adminQueryKeys.mail.detail(message.id),
              });
            }
          }}
        />
      ) : null}
    </div>
  );
}
