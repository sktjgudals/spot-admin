import assert from "node:assert/strict";
import { access, readFile, readdir, stat } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

function parseOklch(value) {
  const match = /^oklch\(([\d.]+)\s+([\d.]+)\s+([\d.]+)\)$/.exec(value);
  assert.ok(match, `expected an opaque OKLCH color, received ${value}`);
  return match.slice(1).map(Number);
}

function relativeLuminance(value) {
  const [lightness, chroma, hue] = parseOklch(value);
  const radians = (hue * Math.PI) / 180;
  const a = chroma * Math.cos(radians);
  const b = chroma * Math.sin(radians);
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const linear = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map((channel) => Math.max(0, Math.min(1, channel)));
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrastRatio(first, second) {
  const firstLuminance = relativeLuminance(first);
  const secondLuminance = relativeLuminance(second);
  return (
    (Math.max(firstLuminance, secondLuminance) + 0.05) /
    (Math.min(firstLuminance, secondLuminance) + 0.05)
  );
}

test("lint excludes local worktrees and generated knowledge artifacts", async () => {
  const config = await readFile(new URL("eslint.config.mjs", root), "utf8");
  assert.match(config, /\.claude\/\*\*/);
  assert.match(config, /graphify-out\/\*\*/);
});

test("admin install metadata has all required icon assets", async () => {
  await Promise.all([
    access(new URL("src/app/favicon.ico", root)),
    access(new URL("src/app/apple-icon.png", root)),
    access(new URL("public/icon-192.png", root)),
    access(new URL("public/icon-512.png", root)),
    access(new URL("public/manifest.webmanifest", root)),
  ]);
});

test("the browser metadata icon stays within the initial-load asset budget", async () => {
  const icon = await stat(new URL("src/app/icon.png", root));
  assert.ok(
    icon.size <= 300_000,
    `src/app/icon.png is ${icon.size} bytes; expected at most 300000`,
  );
});

test("portable design tokens mirror both runtime themes and density foundations", async () => {
  const tokens = JSON.parse(
    await readFile(new URL("docs/design/design-tokens.json", root), "utf8"),
  );

  assert.equal(tokens.color.light.surface.canvas.$value, "oklch(0.975 0.003 275)");
  assert.equal(tokens.color.dark.surface.canvas.$value, "oklch(0.16 0.008 275)");
  assert.equal(tokens.color.light.semantic.success.$value, "oklch(0.53 0.14 153)");
  assert.equal(tokens.color.dark.semantic.success.$value, "oklch(0.69 0.13 153)");
  assert.equal(tokens.typography.size.data.$value, "12px");
  assert.equal(tokens.spacing.base.$value, "4px");
  assert.ok(tokens.shadow.raised.$value.length >= 1);
});

test("interactive tokens and focus indicators retain WCAG contrast in every theme", async () => {
  const [tokens, buttonSource] = await Promise.all([
    readFile(new URL("docs/design/design-tokens.json", root), "utf8").then(JSON.parse),
    readFile(new URL("src/components/ui/button.tsx", root), "utf8"),
  ]);

  for (const themeName of ["light", "dark"]) {
    const theme = tokens.color[themeName];
    assert.ok(
      contrastRatio(
        theme.brand.primaryHover.$value,
        theme.brand.onPrimary.$value,
      ) >= 4.5,
      `${themeName} primary hover text contrast must be at least 4.5:1`,
    );
    for (const background of [
      theme.semantic.dangerSubtle.$value,
      theme.semantic.dangerSubtleHover.$value,
    ]) {
      assert.ok(
        contrastRatio(theme.semantic.dangerStrong.$value, background) >= 4.5,
        `${themeName} destructive button text contrast must be at least 4.5:1`,
      );
    }
    assert.ok(
      contrastRatio(theme.focus.ring.$value, theme.surface.default.$value) >= 3,
      `${themeName} focus ring contrast must be at least 3:1`,
    );
  }

  assert.match(buttonSource, /hover:bg-primary-hover/);
  assert.match(buttonSource, /text-destructive-foreground/);
  assert.match(buttonSource, /hover:bg-destructive-subtle-hover/);

  const sourceRoot = new URL("src/", root);
  const files = (await readdir(sourceRoot, { recursive: true })).filter((file) =>
    /\.(?:ts|tsx)$/.test(file),
  );
  const alphaFocusRings = [];
  for (const file of files) {
    const source = await readFile(new URL(file, sourceRoot), "utf8");
    if (/focus(?:-visible)?:ring-(?:ring|sidebar-ring)\/\d+/.test(source)) {
      alphaFocusRings.push(file);
    }
  }
  assert.deepEqual(
    alphaFocusRings,
    [],
    `focus rings must use the opaque, contrast-tested ring token: ${alphaFocusRings.join(", ")}`,
  );
});

test("the rich mail editor is split and exposes chunk-load recovery", async () => {
  const [source, retryBoundary] = await Promise.all([
    readFile(new URL("src/components/mail/MailConsole.tsx", root), "utf8"),
    readFile(
      new URL(
        "src/components/performance/RetryableLazyComponent.tsx",
        root,
      ),
      "utf8",
    ),
  ]);
  assert.match(
    source,
    /createRetryableLazyComponent<MailRichTextEditorProps>\(\s*\(\)\s*=>\s*import\("@\/components\/mail\/MailRichTextEditor"\)/,
  );
  assert.doesNotMatch(source, /import \{ MailRichTextEditor \} from/);
  assert.match(retryBoundary, /getDerivedStateFromError/);
  assert.match(retryBoundary, /<Suspense fallback=/);
  assert.match(retryBoundary, /key=\{loadState\.attempt\}/);
  assert.match(retryBoundary, /attempt:\s*current\.attempt \+ 1/);
  assert.match(retryBoundary, /class LazyImportError extends Error/);
  assert.match(
    retryBoundary,
    /if \(!\(this\.state\.error instanceof LazyImportError\)\) throw this\.state\.error/,
  );
  assert.equal(
    [...retryBoundary.matchAll(/component:\s*lazy\(loadComponent\)/g)].length,
    2,
    "the initial load and every retry must receive distinct React.lazy payloads",
  );
});

test("protected route groups provide content-shaped instant loading UI", async () => {
  await Promise.all([
    access(new URL("src/app/(super-admin)/super-admin/loading.tsx", root)),
    access(new URL("src/app/(auth-v2)/app/loading.tsx", root)),
  ]);
});

test("the super-admin shell remains statically renderable at build time", async () => {
  const layout = await readFile(
    new URL("src/app/(super-admin)/layout.tsx", root),
    "utf8",
  );
  assert.doesNotMatch(layout, /dynamic\s*=\s*["']force-dynamic["']/);
});

test("report polling refreshes one bounded summary instead of every loaded page", async () => {
  const source = await readFile(
    new URL("src/app/(super-admin)/super-admin/reports/page.tsx", root),
    "utf8",
  );
  const infiniteStart = source.indexOf("const reports = useInfiniteQuery");
  const infiniteEnd = source.indexOf("const pages =", infiniteStart);
  assert.ok(infiniteStart >= 0 && infiniteEnd > infiniteStart);
  assert.doesNotMatch(
    source.slice(infiniteStart, infiniteEnd),
    /refetchInterval/,
  );
  assert.match(source, /listAdminReports\(\{\s*status:\s*"PENDING",\s*limit:\s*1\s*\}\)/s);
  assert.match(source, /refetchInterval:\s*60_000/);
});

test("chat draft updates stay isolated from the retained message timeline", async () => {
  const source = await readFile(
    new URL("src/components/business-mobile/BusinessMobileChatRoom.tsx", root),
    "utf8",
  );
  assert.doesNotMatch(source, /const\s+\[input,\s*setInput\]\s*=\s*useState/);
  assert.match(source, /<ChatComposer/);
  assert.match(source, /useImperativeHandle/);
});

test("application rejection draft updates stay isolated from the applicant grid", async () => {
  const source = await readFile(
    new URL("src/app/(auth-v2)/app/parties/[partyId]/applications/page.tsx", root),
    "utf8",
  );
  const applicationsStart = source.indexOf("function Applications");
  const applicationsEnd = source.indexOf("type ApplicantQuestion");
  assert.ok(applicationsStart >= 0 && applicationsEnd > applicationsStart);
  assert.doesNotMatch(
    source.slice(applicationsStart, applicationsEnd),
    /const\s+\[reason,\s*setReason\]/,
  );
  assert.match(source, /function RejectApplicationDialog/);
});

test("role-specific application chrome is split from the shared authenticated layout", async () => {
  const [layout, businessChrome, businessNavigation] = await Promise.all([
    readFile(new URL("src/app/(auth-v2)/layout.tsx", root), "utf8"),
    readFile(
      new URL(
        "src/components/business-mobile/BusinessMobileChrome.tsx",
        root,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "src/components/business-mobile/BusinessMobileNavigation.tsx",
        root,
      ),
      "utf8",
    ),
  ]);
  assert.match(
    layout,
    /createRetryableLazyComponent<[\s\S]*import\("@\/components\/business-mobile\/BusinessMobileChrome"\)/,
  );
  assert.match(
    layout,
    /createRetryableLazyComponent<[\s\S]*import\("@\/components\/layout\/AdminDesktopChrome"\)/,
  );
  assert.match(layout, /loading:\s*<AuthenticatedShellFallback\s*\/>/);
  assert.doesNotMatch(layout, /import \{ BusinessMobileChrome \} from/);
  assert.doesNotMatch(layout, /import \{ AdminDesktopChrome \} from/);
  assert.match(layout, /if \(!admin\) return null/);
  assert.doesNotMatch(businessChrome, /lucide-react|BusinessBottomNav/);
  assert.match(businessNavigation, /BusinessBottomNav/);
});

test("composite resource pages namespace independent URL filters", async () => {
  const page = await readFile(
    new URL("src/app/(super-admin)/super-admin/[section]/page.tsx", root),
    "utf8",
  );

  for (const namespace of [
    "payments",
    "refunds",
    "review-tag-categories",
    "review-tags",
  ]) {
    assert.match(page, new RegExp(`queryParamNamespace=["']${namespace}["']`));
  }
});

test("desktop party routes do not eagerly load the business operator panel", async () => {
  const [mixedRoute, scopedRoute, desktopPanel, businessPanel] =
    await Promise.all([
      readFile(new URL("src/app/(auth-v2)/app/parties/page.tsx", root), "utf8"),
      readFile(
        new URL(
          "src/app/(auth-v2)/app/businesses/[businessId]/parties/page.tsx",
          root,
        ),
        "utf8",
      ),
      readFile(
        new URL(
          "src/app/(auth-v2)/app/_components/DesktopPartyListPanel.tsx",
          root,
        ),
        "utf8",
      ),
      readFile(
        new URL(
          "src/app/(auth-v2)/app/_components/BusinessPartyListPanel.tsx",
          root,
        ),
        "utf8",
      ),
    ]);

  assert.match(
    mixedRoute,
    /createRetryableLazyComponent<BusinessPartyListPanelProps>\([\s\S]*import\("\.\.\/_components\/BusinessPartyListPanel"\)/,
  );
  assert.doesNotMatch(mixedRoute, /import\s+\{\s*BusinessPartyListPanel\s*\}/);
  assert.match(scopedRoute, /import\s+\{\s*DesktopPartyListPanel\s*\}/);
  assert.doesNotMatch(
    scopedRoute,
    /from\s+["'][^"']*\/_components\/BusinessPartyListPanel["']/,
  );
  assert.doesNotMatch(desktopPanel, /DopaMediaImage|useInfiniteQuery|BusinessBottomNav/);
  assert.doesNotMatch(businessPanel, /listParties|<Table/);
});

test("GA4 reporting setup is documented as public build configuration", async () => {
  const [environment, operations] = await Promise.all([
    readFile(new URL(".env.example", root), "utf8"),
    readFile(new URL("docs/OPERATIONS.md", root), "utf8"),
  ]);

  assert.match(environment, /^NEXT_PUBLIC_GA4_PROPERTIES=/m);
  assert.match(operations, /\/super-admin\/analytics/);
  assert.match(operations, /analytics\.readonly/);
  assert.match(operations, /브라우저 메모리/);
});

test("the Next.js bundle can be inspected without a production deployment", async () => {
  const packageJson = JSON.parse(await readFile(new URL("package.json", root), "utf8"));
  assert.equal(packageJson.scripts.analyze, "next experimental-analyze");
});

test("client validation uses the tree-shakable Zod Mini entrypoint", async () => {
  const sourceRoot = new URL("src/", root);
  const files = await readdir(sourceRoot, { recursive: true });
  const sourceFiles = files.filter((file) => /\.(?:ts|tsx)$/.test(file));
  const sources = await Promise.all(
    sourceFiles.map((file) => readFile(new URL(file, sourceRoot), "utf8")),
  );

  for (const source of sources) {
    assert.doesNotMatch(source, /from\s+["']zod["']/);
  }
});

test("Sentry is deferred from the initial client and error-boundary bundles", async () => {
  const [instrumentation, errorBoundary, globalError, nextConfig] =
    await Promise.all([
      readFile(new URL("src/instrumentation-client.ts", root), "utf8"),
      readFile(new URL("src/app/error.tsx", root), "utf8"),
      readFile(new URL("src/app/global-error.tsx", root), "utf8"),
      readFile(new URL("next.config.ts", root), "utf8"),
    ]);

  for (const source of [instrumentation, errorBoundary, globalError]) {
    assert.doesNotMatch(source, /import\s+\*\s+as\s+Sentry\s+from/);
  }
  assert.match(instrumentation, /preloadClientObservability/);
  assert.match(nextConfig, /excludeDebugStatements:\s*true/);
});

test("Next.js development accepts both loopback hostnames used by local QA", async () => {
  const config = await readFile(new URL("next.config.ts", root), "utf8");
  assert.match(config, /allowedDevOrigins:\s*\[[^\]]*"127\.0\.0\.1"[^\]]*\]/s);
});

test("the root error fallback honors semantic light and dark theme tokens", async () => {
  const source = await readFile(new URL("src/app/global-error.tsx", root), "utf8");
  assert.doesNotMatch(source, /(?:bg|text)-slate-/);
  assert.match(source, /bg-background/);
  assert.match(source, /text-foreground/);
});

test("authentication surfaces do not bypass the semantic theme palette", async () => {
  const [guard, wizard] = await Promise.all([
    readFile(new URL("src/auth/guards/AuthGuard.tsx", root), "utf8"),
    readFile(new URL("src/components/auth/EmailCodeWizard.tsx", root), "utf8"),
  ]);

  for (const source of [guard, wizard]) {
    assert.doesNotMatch(source, /(?:bg|text|border)-(?:slate|amber)-/);
  }
});

test("operator chrome does not render essential information below 12px", async () => {
  const sources = await Promise.all([
    readFile(new URL("src/components/layout/AdminSidebar.tsx", root), "utf8"),
    readFile(new URL("src/components/mail/MailConsole.tsx", root), "utf8"),
    readFile(new URL("src/components/mail/MailRichTextEditor.tsx", root), "utf8"),
    readFile(
      new URL("src/components/business-mobile/BusinessMobileChatRoom.tsx", root),
      "utf8",
    ),
    readFile(
      new URL(
        "src/app/(auth-v2)/app/businesses/[businessId]/invitations/page.tsx",
        root,
      ),
      "utf8",
    ),
  ]);

  for (const source of sources) {
    assert.doesNotMatch(source, /text-\[(?:9|10|11)px\]/);
  }
});

test("application status colors use the semantic palette", async () => {
  const sourceRoot = new URL("src/", root);
  const files = await readdir(sourceRoot, { recursive: true });
  const sourceFiles = files.filter((file) => /\.(?:ts|tsx)$/.test(file));
  const sources = await Promise.all(
    sourceFiles.map((file) => readFile(new URL(file, sourceRoot), "utf8")),
  );

  for (const source of sources) {
    assert.doesNotMatch(
      source,
      /(?:bg|text|border|ring|fill)-(?:red|green|emerald|amber|yellow|blue|violet|purple|pink)-/,
    );
  }
});

test("route metadata relies on the root title template without duplicate branding", async () => {
  const source = await readFile(new URL("src/app/not-found.tsx", root), "utf8");
  assert.match(source, /title:\s*"페이지를 찾을 수 없습니다"/);
  assert.doesNotMatch(source, /title:[^\n]*Dopa Admin/);
});

test("the theme provider suppresses only the expected root html hydration difference", async () => {
  const source = await readFile(new URL("src/app/layout.tsx", root), "utf8");
  assert.match(source, /<html[^>]*suppressHydrationWarning/);
});

test("the root shell does not preload the legacy multi-megabyte local font", async () => {
  const [layout, styles] = await Promise.all([
    readFile(new URL("src/app/layout.tsx", root), "utf8"),
    readFile(new URL("src/app/globals.css", root), "utf8"),
  ]);

  assert.doesNotMatch(layout, /next\/font\/local/);
  assert.doesNotMatch(layout, /PretendardVariable\.woff2/);
  assert.doesNotMatch(styles, /--font-pretendard/);
  assert.match(styles, /--font-sans:[^;]*Apple SD Gothic Neo/s);
});

test("the admin shell exposes one page heading and one visible theme control", async () => {
  const [chrome, sidebar] = await Promise.all([
    readFile(new URL("src/components/layout/AdminDesktopChrome.tsx", root), "utf8"),
    readFile(new URL("src/components/layout/AdminSidebar.tsx", root), "utf8"),
  ]);

  assert.doesNotMatch(chrome, /<h1/);
  assert.equal(sidebar.match(/<ThemeToggle/g)?.length, 1);
});
