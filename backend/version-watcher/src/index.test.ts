import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import worker, {
  checkChatGptVersion,
  parseSparkleFeed,
} from "./index";

const current = "26.825.51511";
const latest = "26.901.10101";
const checkToken = "test-check-token-at-least-24-characters";
const trustedAuthor = Object.freeze({
  user: Object.freeze({ login: "zats", type: "User" }),
});

function appBuild(version: string): string {
  return version === current ? "7377" : "8001";
}

function downloadLength(version: string): number {
  return version === current ? 595_263_123 : 600_000_001;
}

function downloadEdSignature(version: string): string {
  return btoa(version.padEnd(64, "x").slice(0, 64));
}

function sparkleVersion(version: string) {
  return {
    version,
    appBuild: appBuild(version),
    downloadUrl: archiveUrl(version),
    downloadLength: downloadLength(version),
    downloadEdSignature: downloadEdSignature(version),
  };
}

function claimIdentityFor(value: ReturnType<typeof sparkleVersion>): string {
  return [
    value.version,
    value.appBuild,
    String(value.downloadLength),
    value.downloadEdSignature,
  ].join("@");
}

function claimIdentity(version: string): string {
  return claimIdentityFor(sparkleVersion(version));
}

function issueTitleFor(
  value: ReturnType<typeof sparkleVersion>,
  mode: "current" | "correction" = "current",
): string {
  return `ChatGPT ${value.version} (${value.appBuild}) binding [${mode}]`;
}

function issueTitle(version: string, mode: "current" | "correction" = "current"): string {
  return issueTitleFor(sparkleVersion(version), mode);
}

function issueBodyFor(
  value: ReturnType<typeof sparkleVersion>,
  mode: "current" | "correction" = "current",
): string {
  return JSON.stringify({
    schema: 2,
    mode,
    ...value,
  }, null, 2);
}

function issueBody(version: string, mode: "current" | "correction" = "current"): string {
  return issueBodyFor(sparkleVersion(version), mode);
}

function archiveUrl(version: string): string {
  return `https://persistent.oaistatic.com/codex-app-prod/ChatGPT-darwin-arm64-${version}.zip`;
}

function feedValues(...values: ReturnType<typeof sparkleVersion>[]): string {
  return `<?xml version="1.0"?><rss><channel>${values.map((value) => `
    <item><title>${value.version}</title>
      <sparkle:version>${value.appBuild}</sparkle:version>
      <sparkle:shortVersionString>${value.version}</sparkle:shortVersionString>
      <sparkle:hardwareRequirements>arm64</sparkle:hardwareRequirements>
      <enclosure url="https://example.invalid/delta-${value.version}.zip" sparkle:deltaFrom="old" />
      <enclosure url="${value.downloadUrl}" length="${value.downloadLength}"
        sparkle:edSignature="${value.downloadEdSignature}" />
    </item>`).join("")}</channel></rss>`;
}

function feed(...versions: string[]): string {
  return feedValues(...versions.map(sparkleVersion));
}

function bindingIndex(extra: Record<string, unknown> = {}): object {
  return {
    schemaVersion: 2,
    current,
    bindings: {
      [current]: {
        version: current,
        appBuild: "7377",
        appAsarSha256: "a".repeat(64),
        downloadUrl: archiveUrl(current),
        downloadLength: downloadLength(current),
        downloadEdSignature: downloadEdSignature(current),
      },
      ...extra,
    },
  };
}

function bindingManifest(version = current, appBuild = "7377", digest = "a".repeat(64)): object {
  return {
    schemaVersion: 2,
    version,
    appBuild,
    appAsarSha256: digest,
    downloadUrl: archiveUrl(version),
    downloadLength: downloadLength(version),
    downloadEdSignature: downloadEdSignature(version),
    apiVersion: "0.2.0",
    adapterVersion: "1.0.0",
    artifacts: { host: { path: "host.js", sha256: "b".repeat(64) } },
  };
}

function immutableRelease(version = current, adapterVersion = "1.0.0") {
  const archive = `chatgpt-binding-${version}-v${adapterVersion}.zip`;
  const archiveDigest = "1".repeat(64);
  const checksum = `${archiveDigest}  ${archive}\n`;
  const checksumDigest = createHash("sha256").update(checksum).digest("hex");
  return {
    release: {
      tag_name: `binding-${version}-v${adapterVersion}`,
      draft: false,
      prerelease: false,
      immutable: true,
      assets: [
        { id: 100, name: archive, state: "uploaded", digest: `sha256:${archiveDigest}` },
        { id: 101, name: `${archive}.sha256`, state: "uploaded", digest: `sha256:${checksumDigest}` },
      ],
    },
    checksum,
  };
}

function response(body: unknown, status = 200): Response {
  return new Response(
    status === 204
      ? null
      : typeof body === "string"
        ? body
        : JSON.stringify(body),
    { status },
  );
}

interface Claim {
  state: "creating" | "issue";
  issue_number: number | null;
  lease_expires_at: number;
  updated_at: number;
}

class MemoryClaims {
  readonly rows = new Map<string, Claim>();

  constructor(private readonly failIssueRecord = false) {}

  prepare(sql: string): D1PreparedStatement {
    return {
      bind: (...values: unknown[]) => this.statement(sql, values),
    } as unknown as D1PreparedStatement;
  }

  private statement(sql: string, values: unknown[]): D1PreparedStatement {
    return {
      run: async () => {
        if (sql.startsWith("INSERT INTO version_claims") && sql.includes("'creating'")) {
          const [version, lease, now] = values as [string, number, number];
          const previous = this.rows.get(version);
          const acquired = !previous ||
            (previous.state === "creating" && previous.lease_expires_at <= now);
          if (acquired) {
            this.rows.set(version, {
              state: "creating",
              issue_number: null,
              lease_expires_at: lease,
              updated_at: now,
            });
          }
          return { meta: { changes: acquired ? 1 : 0 } };
        }
        if (sql.startsWith("INSERT INTO version_claims") && sql.includes("'issue'")) {
          if (this.failIssueRecord) {
            throw new Error("D1 issue record failed");
          }
          const [version, issueNumber, now] = values as [string, number, number];
          this.rows.set(version, {
            state: "issue",
            issue_number: issueNumber,
            lease_expires_at: 0,
            updated_at: now,
          });
          return { meta: { changes: 1 } };
        }
        if (sql.startsWith("DELETE FROM version_claims")) {
          const [version] = values as [string];
          const previous = this.rows.get(version);
          const requiredState = sql.includes("state = 'issue'") ? "issue" : "creating";
          const removed = previous?.state === requiredState;
          if (removed) this.rows.delete(version);
          return { meta: { changes: removed ? 1 : 0 } };
        }
        throw new Error(`Unsupported D1 run: ${sql}`);
      },
      first: async () => {
        const [version] = values as [string];
        return this.rows.get(version) ?? null;
      },
    } as unknown as D1PreparedStatement;
  }
}

function environment(claims = new MemoryClaims()) {
  return {
    env: {
      GITHUB_TOKEN: "github-token",
      CHECK_TOKEN: checkToken,
      GITHUB_OWNER: "zats",
      GITHUB_REPO: "chatgpt-extensions",
      GITHUB_BRANCH: "main",
      GITHUB_ISSUE_AUTHOR: "zats",
      VERSION_CLAIMS: claims as unknown as D1Database,
    },
    claims,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Sparkle feed", () => {
  it("selects every exact full arm64 archive in feed order", () => {
    const xml = `${feed(latest, current)}
      <item><title>26.1.1</title><enclosure url="https://example.invalid/not-full.zip" /></item>`;
    expect(parseSparkleFeed(xml)).toEqual([
      sparkleVersion(latest),
      sparkleVersion(current),
    ]);
  });

  it("ignores duplicate versions and an archive for the wrong version", () => {
    const xml = `${feed(latest, latest)}<item><title>26.2.2</title>
      <enclosure url="${archiveUrl(latest)}" /></item>`;
    expect(parseSparkleFeed(xml)).toEqual([
      sparkleVersion(latest),
    ]);
  });

  it("fails when the newest full arm64 item lacks exact metadata", () => {
    const value = sparkleVersion(latest);
    const xml = feedValues(value)
      .replace(`<sparkle:version>${value.appBuild}</sparkle:version>`, "")
      .replace(` sparkle:edSignature="${value.downloadEdSignature}"`, "");
    expect(() => parseSparkleFeed(xml)).toThrow(
      `Newest full arm64 Sparkle item is malformed: ${latest}`,
    );
  });

  it("does not fall back when the newest full arm64 item is malformed", () => {
    const newest = sparkleVersion(latest);
    const xml = feedValues(newest, sparkleVersion(current)).replace(
      `length="${newest.downloadLength}"`,
      'length="invalid"',
    );

    expect(() => parseSparkleFeed(xml)).toThrow(
      `Newest full arm64 Sparkle item is malformed: ${latest}`,
    );
  });
});

describe("HTTP trigger", () => {
  it("requires POST and the manual check secret", async () => {
    const { env } = environment();
    expect((await worker.fetch(new Request("https://watcher.test/check"), env)).status).toBe(405);
    expect((await worker.fetch(new Request("https://watcher.test/check", { method: "POST" }), env)).status).toBe(401);
    expect((await worker.fetch(new Request("https://watcher.test/nope", { method: "POST" }), env)).status).toBe(404);
  });
});

describe("version check", () => {
  it("rejects an invalid configured issue author before network access", async () => {
    const { env } = environment();
    env.GITHUB_ISSUE_AUTHOR = "not/a/login";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(checkChatGptVersion(env)).rejects.toThrow(
      /GITHUB_ISSUE_AUTHOR is invalid/,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("stops when the exact indexed binding and directory manifest exist", async () => {
    const { env } = environment();
    const published = immutableRelease();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(feed(current)))
      .mockResolvedValueOnce(response(bindingIndex()))
      .mockResolvedValueOnce(response(bindingManifest()))
      .mockResolvedValueOnce(response(published.release))
      .mockResolvedValueOnce(response(published.checksum))
      .mockResolvedValueOnce(response(bindingManifest()));
    vi.stubGlobal("fetch", fetchMock);

    await expect(checkChatGptVersion(env)).resolves.toEqual({
      ...sparkleVersion(current),
      outcome: "binding-exists",
    });
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });

  it("repairs a correction release whose tagged manifest has the prior adapter version", async () => {
    const { env } = environment();
    const correctedManifest = {
      ...bindingManifest(),
      adapterVersion: "1.0.1",
    };
    const published = immutableRelease(current, "1.0.1");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(feed(current)))
      .mockResolvedValueOnce(response(bindingIndex()))
      .mockResolvedValueOnce(response(correctedManifest))
      .mockResolvedValueOnce(response(published.release))
      .mockResolvedValueOnce(response(published.checksum))
      .mockResolvedValueOnce(response(bindingManifest()))
      .mockResolvedValueOnce(response({ items: [] }))
      .mockResolvedValueOnce(response({ name: "chatgpt-binding" }))
      .mockResolvedValueOnce(response({ name: "pending" }))
      .mockResolvedValueOnce(response({
        ...trustedAuthor,
        number: 52,
        title: issueTitle(current),
        body: issueBody(current),
        state: "open",
      }, 201));
    vi.stubGlobal("fetch", fetchMock);

    await expect(checkChatGptVersion(env)).resolves.toMatchObject({
      outcome: "issue-created",
      issueNumber: 52,
    });
    expect(fetchMock).toHaveBeenCalledTimes(10);
  });

  it("creates a current repair request when the exact binding has no immutable release", async () => {
    const { env } = environment();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(feed(current)))
      .mockResolvedValueOnce(response(bindingIndex()))
      .mockResolvedValueOnce(response(bindingManifest()))
      .mockResolvedValueOnce(response({}, 404))
      .mockResolvedValueOnce(response({ items: [] }))
      .mockResolvedValueOnce(response({ name: "chatgpt-binding" }))
      .mockResolvedValueOnce(response({ name: "pending" }))
      .mockResolvedValueOnce(response({
        ...trustedAuthor,
        number: 50,
        title: issueTitle(current),
        body: issueBody(current),
        state: "open",
      }, 201));
    vi.stubGlobal("fetch", fetchMock);

    await expect(checkChatGptVersion(env)).resolves.toMatchObject({
      outcome: "issue-created",
      issueNumber: 50,
    });
  });

  it("creates a repair request when immutable release checksums do not match", async () => {
    const { env } = environment();
    const published = immutableRelease();
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(response(feed(current)))
      .mockResolvedValueOnce(response(bindingIndex()))
      .mockResolvedValueOnce(response(bindingManifest()))
      .mockResolvedValueOnce(response(published.release))
      .mockResolvedValueOnce(response(`${"2".repeat(64)}  wrong.zip\n`))
      .mockResolvedValueOnce(response({ items: [] }))
      .mockResolvedValueOnce(response({ name: "chatgpt-binding" }))
      .mockResolvedValueOnce(response({ name: "pending" }))
      .mockResolvedValueOnce(response({
        ...trustedAuthor,
        number: 51,
        title: issueTitle(current),
        body: issueBody(current),
        state: "open",
      }, 201)));

    await expect(checkChatGptVersion(env)).resolves.toMatchObject({
      outcome: "issue-created",
      issueNumber: 51,
    });
  });

  it("rejects a manifest whose exact app identity differs from the index", async () => {
    const { env } = environment();
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(response(feed(current)))
      .mockResolvedValueOnce(response(bindingIndex()))
      .mockResolvedValueOnce(response(bindingManifest(current, "9999"))));
    await expect(checkChatGptVersion(env)).rejects.toThrow(
      `invalid manifest for ${current}`,
    );
  });

  it("retries a transient feed response", async () => {
    const { env } = environment();
    const published = immutableRelease();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response("busy", 503))
      .mockResolvedValueOnce(response(feed(current)))
      .mockResolvedValueOnce(response(bindingIndex()))
      .mockResolvedValueOnce(response(bindingManifest()))
      .mockResolvedValueOnce(response(published.release))
      .mockResolvedValueOnce(response(published.checksum))
      .mockResolvedValueOnce(response(bindingManifest()));
    vi.stubGlobal("fetch", fetchMock);
    await expect(checkChatGptVersion(env)).resolves.toMatchObject({
      outcome: "binding-exists",
    });
    expect(fetchMock).toHaveBeenCalledTimes(7);
  });

  it("creates one atomically labeled issue after it acquires the D1 claim", async () => {
    const { env, claims } = environment();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(feed(latest, current)))
      .mockResolvedValueOnce(response(bindingIndex()))
      .mockResolvedValueOnce(response(bindingManifest()))
      .mockResolvedValueOnce(response({ items: [] }))
      .mockResolvedValueOnce(response({}, 404))
      .mockResolvedValueOnce(response({ name: "chatgpt-binding" }, 201))
      .mockResolvedValueOnce(response({}, 404))
      .mockResolvedValueOnce(response({ name: "pending" }, 201))
      .mockResolvedValueOnce(response({
        ...trustedAuthor,
        number: 42,
        title: issueTitle(latest),
        body: issueBody(latest),
        state: "open",
      }, 201));
    vi.stubGlobal("fetch", fetchMock);

    await expect(checkChatGptVersion(env)).resolves.toEqual({
      ...sparkleVersion(latest),
      outcome: "issue-created",
      issueNumber: 42,
    });
    const issueCall = fetchMock.mock.calls.at(-1);
    expect(JSON.parse(issueCall?.[1]?.body as string)).toEqual({
      title: issueTitle(latest),
      body: issueBody(latest),
      labels: ["chatgpt-binding", "pending"],
    });
    expect(claims.rows.get(claimIdentity(latest))).toMatchObject({
      state: "issue",
      issue_number: 42,
    });
  });

  it("opens a current request when the exact newest binding is not selected", async () => {
    const { env } = environment();
    const latestEntry = {
      version: latest,
      appBuild: appBuild(latest),
      appAsarSha256: "b".repeat(64),
      downloadUrl: archiveUrl(latest),
      downloadLength: downloadLength(latest),
      downloadEdSignature: downloadEdSignature(latest),
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(feed(latest, current)))
      .mockResolvedValueOnce(response(bindingIndex({ [latest]: latestEntry })))
      .mockResolvedValueOnce(response(bindingManifest()))
      .mockResolvedValueOnce(response(bindingManifest(latest, appBuild(latest), "b".repeat(64))))
      .mockResolvedValueOnce(response({ items: [] }))
      .mockResolvedValueOnce(response({ items: [] }))
      .mockResolvedValueOnce(response({}, 404))
      .mockResolvedValueOnce(response({ name: "chatgpt-binding" }, 201))
      .mockResolvedValueOnce(response({}, 404))
      .mockResolvedValueOnce(response({ name: "pending" }, 201))
      .mockResolvedValueOnce(response({
        ...trustedAuthor,
        number: 44,
        title: issueTitle(latest),
        body: issueBody(latest),
        state: "open",
      }, 201));
    vi.stubGlobal("fetch", fetchMock);

    await expect(checkChatGptVersion(env)).resolves.toEqual({
      ...sparkleVersion(latest),
      outcome: "issue-created",
      issueNumber: 44,
    });
    expect(JSON.parse(fetchMock.mock.calls.at(-1)?.[1]?.body as string)).toEqual({
      title: issueTitle(latest),
      body: issueBody(latest),
      labels: ["chatgpt-binding", "pending"],
    });
    expect(fetchMock).toHaveBeenCalledTimes(11);
  });

  it("opens a correction for a replaced non-current archive identity", async () => {
    const replacement = {
      ...sparkleVersion(latest),
      appBuild: "8002",
      downloadLength: downloadLength(latest) + 17,
      downloadEdSignature: btoa("replacement-non-current".padEnd(64, "x")),
    };
    const indexed = {
      version: latest,
      appBuild: appBuild(latest),
      appAsarSha256: "b".repeat(64),
      downloadUrl: archiveUrl(latest),
      downloadLength: downloadLength(latest),
      downloadEdSignature: downloadEdSignature(latest),
    };
    const { env, claims } = environment();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(feedValues(replacement, sparkleVersion(current))))
      .mockResolvedValueOnce(response(bindingIndex({ [latest]: indexed })))
      .mockResolvedValueOnce(response(bindingManifest()))
      .mockResolvedValueOnce(response(bindingManifest(latest, appBuild(latest), "b".repeat(64))))
      .mockResolvedValueOnce(response({ items: [] }))
      .mockResolvedValueOnce(response({}, 404))
      .mockResolvedValueOnce(response({ name: "chatgpt-binding" }, 201))
      .mockResolvedValueOnce(response({}, 404))
      .mockResolvedValueOnce(response({ name: "pending" }, 201))
      .mockResolvedValueOnce(response({
        ...trustedAuthor,
        number: 45,
        title: issueTitleFor(replacement, "correction"),
        body: issueBodyFor(replacement, "correction"),
        state: "open",
      }, 201));
    vi.stubGlobal("fetch", fetchMock);

    await expect(checkChatGptVersion(env)).resolves.toEqual({
      ...replacement,
      outcome: "issue-created",
      issueNumber: 45,
    });
    expect(JSON.parse(fetchMock.mock.calls.at(-1)?.[1]?.body as string)).toEqual({
      title: issueTitleFor(replacement, "correction"),
      body: issueBodyFor(replacement, "correction"),
      labels: ["chatgpt-binding", "pending"],
    });
    expect(claims.rows.get(claimIdentityFor(replacement))).toMatchObject({
      state: "issue",
      issue_number: 45,
    });
    expect(fetchMock).toHaveBeenCalledTimes(10);
  });

  it("waits while the repaired non-current correction is open", async () => {
    const repaired = {
      ...sparkleVersion(latest),
      appBuild: "8002",
      downloadLength: downloadLength(latest) + 17,
      downloadEdSignature: btoa("replacement-non-current".padEnd(64, "x")),
    };
    const repairedEntry = {
      ...repaired,
      appAsarSha256: "c".repeat(64),
    };
    const repairedManifest = {
      ...bindingManifest(latest, repaired.appBuild, repairedEntry.appAsarSha256),
      downloadLength: repaired.downloadLength,
      downloadEdSignature: repaired.downloadEdSignature,
      adapterVersion: "1.0.1",
    };
    const { env, claims } = environment();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(feedValues(repaired, sparkleVersion(current))))
      .mockResolvedValueOnce(response(bindingIndex({ [latest]: repairedEntry })))
      .mockResolvedValueOnce(response(bindingManifest()))
      .mockResolvedValueOnce(response(repairedManifest))
      .mockResolvedValueOnce(response({ items: [] }))
      .mockResolvedValueOnce(response({
        items: [{
          ...trustedAuthor,
          number: 45,
          title: issueTitleFor(repaired, "correction"),
          body: issueBodyFor(repaired, "correction"),
          state: "open",
        }],
      }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(checkChatGptVersion(env)).resolves.toEqual({
      ...repaired,
      outcome: "claim-active",
      issueNumber: 45,
    });
    expect(claims.rows.get(claimIdentityFor(repaired))).toMatchObject({
      state: "issue",
      issue_number: 45,
    });
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });

  it("advances a repaired non-current identity after the correction closes", async () => {
    const repaired = {
      ...sparkleVersion(latest),
      appBuild: "8002",
      downloadLength: downloadLength(latest) + 17,
      downloadEdSignature: btoa("replacement-non-current".padEnd(64, "x")),
    };
    const repairedEntry = {
      ...repaired,
      appAsarSha256: "c".repeat(64),
    };
    const repairedManifest = {
      ...bindingManifest(latest, repaired.appBuild, repairedEntry.appAsarSha256),
      downloadLength: repaired.downloadLength,
      downloadEdSignature: repaired.downloadEdSignature,
      adapterVersion: "1.0.1",
    };
    const { env, claims } = environment();
    claims.rows.set(claimIdentityFor(repaired), {
      state: "issue",
      issue_number: 45,
      lease_expires_at: 0,
      updated_at: Math.floor(Date.now() / 1000),
    });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(feedValues(repaired, sparkleVersion(current))))
      .mockResolvedValueOnce(response(bindingIndex({ [latest]: repairedEntry })))
      .mockResolvedValueOnce(response(bindingManifest()))
      .mockResolvedValueOnce(response(repairedManifest))
      .mockResolvedValueOnce(response({ items: [] }))
      .mockResolvedValueOnce(response({
        items: [{
          ...trustedAuthor,
          number: 45,
          title: issueTitleFor(repaired, "correction"),
          body: issueBodyFor(repaired, "correction"),
          state: "closed",
        }],
      }))
      .mockResolvedValueOnce(response({
        ...trustedAuthor,
        number: 45,
        title: issueTitleFor(repaired, "correction"),
        body: issueBodyFor(repaired, "correction"),
        state: "closed",
      }))
      .mockResolvedValueOnce(response({ name: "chatgpt-binding" }))
      .mockResolvedValueOnce(response({ name: "pending" }))
      .mockResolvedValueOnce(response({
        ...trustedAuthor,
        number: 46,
        title: issueTitleFor(repaired),
        body: issueBodyFor(repaired),
        state: "open",
      }, 201));
    vi.stubGlobal("fetch", fetchMock);

    await expect(checkChatGptVersion(env)).resolves.toEqual({
      ...repaired,
      outcome: "issue-created",
      issueNumber: 46,
    });
    expect(JSON.parse(fetchMock.mock.calls.at(-1)?.[1]?.body as string)).toEqual({
      title: issueTitleFor(repaired),
      body: issueBodyFor(repaired),
      labels: ["chatgpt-binding", "pending"],
    });
    expect(claims.rows.get(claimIdentityFor(repaired))).toMatchObject({
      state: "issue",
      issue_number: 46,
    });
    expect(fetchMock).toHaveBeenCalledTimes(10);
  });

  it("opens a correction for a replaced current archive identity", async () => {
    const replacement = {
      ...sparkleVersion(current),
      appBuild: "7378",
      downloadLength: downloadLength(current) + 17,
      downloadEdSignature: btoa("replacement".padEnd(64, "x")),
    };
    const { env, claims } = environment();
    const priorLengthIdentity = { ...replacement, downloadLength: replacement.downloadLength - 1 };
    claims.rows.set(claimIdentityFor(priorLengthIdentity), {
      state: "issue",
      issue_number: 12,
      lease_expires_at: 0,
      updated_at: Math.floor(Date.now() / 1000),
    });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(feedValues(replacement)))
      .mockResolvedValueOnce(response(bindingIndex()))
      .mockResolvedValueOnce(response(bindingManifest()))
      .mockResolvedValueOnce(response({ items: [] }))
      .mockResolvedValueOnce(response({}, 404))
      .mockResolvedValueOnce(response({ name: "chatgpt-binding" }, 201))
      .mockResolvedValueOnce(response({}, 404))
      .mockResolvedValueOnce(response({ name: "pending" }, 201))
      .mockResolvedValueOnce(response({
        ...trustedAuthor,
        number: 43,
        title: issueTitleFor(replacement, "correction"),
        body: issueBodyFor(replacement, "correction"),
        state: "open",
      }, 201));
    vi.stubGlobal("fetch", fetchMock);

    await expect(checkChatGptVersion(env)).resolves.toEqual({
      ...replacement,
      outcome: "issue-created",
      issueNumber: 43,
    });
    expect(JSON.parse(fetchMock.mock.calls.at(-1)?.[1]?.body as string)).toEqual({
      title: issueTitleFor(replacement, "correction"),
      body: issueBodyFor(replacement, "correction"),
      labels: ["chatgpt-binding", "pending"],
    });
    expect(claims.rows.get(claimIdentityFor(replacement))).toMatchObject({
      state: "issue",
      issue_number: 43,
    });
    expect(claims.rows.get(claimIdentityFor(priorLengthIdentity))).toMatchObject({
      issue_number: 12,
    });
  });

  it("returns an active claim instead of creating a duplicate issue", async () => {
    const { env, claims } = environment();
    claims.rows.set(claimIdentity(latest), {
      state: "creating",
      issue_number: null,
      lease_expires_at: Math.floor(Date.now() / 1000) + 600,
      updated_at: Math.floor(Date.now() / 1000),
    });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(feed(latest)))
      .mockResolvedValueOnce(response(bindingIndex()))
      .mockResolvedValueOnce(response(bindingManifest()))
      .mockResolvedValueOnce(response({ items: [] }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(checkChatGptVersion(env)).resolves.toMatchObject({
      version: latest,
      outcome: "claim-active",
    });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("does not reuse an issue whose canonical title has a stale body", async () => {
    const { env, claims } = environment();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(feed(latest)))
      .mockResolvedValueOnce(response(bindingIndex()))
      .mockResolvedValueOnce(response(bindingManifest()))
      .mockResolvedValueOnce(response({
        items: [{
          ...trustedAuthor,
          number: 6,
          title: issueTitle(latest),
          body: "stale request",
          state: "open",
        }],
      }))
      .mockResolvedValueOnce(response({ name: "chatgpt-binding" }))
      .mockResolvedValueOnce(response({ name: "pending" }))
      .mockResolvedValueOnce(response({
        ...trustedAuthor,
        number: 44,
        title: issueTitle(latest),
        body: issueBody(latest),
        state: "open",
      }, 201));
    vi.stubGlobal("fetch", fetchMock);

    await expect(checkChatGptVersion(env)).resolves.toMatchObject({
      outcome: "issue-created",
      issueNumber: 44,
    });
    expect(claims.rows.get(claimIdentity(latest))).toMatchObject({
      state: "issue",
      issue_number: 44,
    });
  });

  it("ignores an exact public issue from an untrusted author", async () => {
    const { env, claims } = environment();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(feed(latest)))
      .mockResolvedValueOnce(response(bindingIndex()))
      .mockResolvedValueOnce(response(bindingManifest()))
      .mockResolvedValueOnce(response({
        items: [{
          user: { login: "public-user", type: "User" },
          number: 45,
          title: issueTitle(latest),
          body: issueBody(latest),
          state: "open",
        }],
      }))
      .mockResolvedValueOnce(response({ name: "chatgpt-binding" }))
      .mockResolvedValueOnce(response({ name: "pending" }))
      .mockResolvedValueOnce(response({
        ...trustedAuthor,
        number: 46,
        title: issueTitle(latest),
        body: issueBody(latest),
        state: "open",
      }, 201));
    vi.stubGlobal("fetch", fetchMock);

    await expect(checkChatGptVersion(env)).resolves.toMatchObject({
      outcome: "issue-created",
      issueNumber: 46,
    });
    expect(String(fetchMock.mock.calls[3]?.[0])).toContain("author%3Azats");
    expect(claims.rows.get(claimIdentity(latest))).toMatchObject({
      state: "issue",
      issue_number: 46,
    });
  });

  it("fails closed when multiple trusted issues have the exact identity", async () => {
    const { env } = environment();
    const exact = {
      ...trustedAuthor,
      title: issueTitle(latest),
      body: issueBody(latest),
      state: "open",
    };
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(response(feed(latest)))
      .mockResolvedValueOnce(response(bindingIndex()))
      .mockResolvedValueOnce(response(bindingManifest()))
      .mockResolvedValueOnce(response({
        items: [
          { ...exact, number: 47 },
          { ...exact, number: 48 },
        ],
      })));

    await expect(checkChatGptVersion(env)).rejects.toThrow(
      /Multiple trusted issues have the exact identity/,
    );
  });

  it("reopens a closed issue when its binding is still missing", async () => {
    const { env, claims } = environment();
    claims.rows.set(claimIdentity(latest), {
      state: "issue",
      issue_number: 7,
      lease_expires_at: 0,
      updated_at: Math.floor(Date.now() / 1000),
    });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(feed(latest)))
      .mockResolvedValueOnce(response(bindingIndex()))
      .mockResolvedValueOnce(response(bindingManifest()))
      .mockResolvedValueOnce(response({
        items: [{
          ...trustedAuthor,
          number: 7,
          title: issueTitle(latest),
          body: issueBody(latest),
          state: "closed",
        }],
      }))
      .mockResolvedValueOnce(response({ name: "chatgpt-binding" }))
      .mockResolvedValueOnce(response({ name: "pending" }))
      .mockResolvedValueOnce(response({ number: 7, state: "open" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(checkChatGptVersion(env)).resolves.toMatchObject({
      outcome: "issue-reopened",
      issueNumber: 7,
    });
    const patchCall = fetchMock.mock.calls.at(-1);
    expect(patchCall?.[1]?.method).toBe("PATCH");
    expect(JSON.parse(patchCall?.[1]?.body as string)).toEqual({
      state: "open",
      labels: ["chatgpt-binding", "pending"],
    });
    expect(claims.rows.get(claimIdentity(latest))).toMatchObject({
      state: "issue",
      issue_number: 7,
    });
  });

  it("reopens the recorded issue when search indexing does not return it", async () => {
    const { env, claims } = environment();
    claims.rows.set(claimIdentity(latest), {
      state: "issue",
      issue_number: 8,
      lease_expires_at: 0,
      updated_at: Math.floor(Date.now() / 1000),
    });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(feed(latest)))
      .mockResolvedValueOnce(response(bindingIndex()))
      .mockResolvedValueOnce(response(bindingManifest()))
      .mockResolvedValueOnce(response({ items: [] }))
      .mockResolvedValueOnce(response({
        ...trustedAuthor,
        number: 8,
        title: issueTitle(latest),
        body: issueBody(latest),
        state: "closed",
      }))
      .mockResolvedValueOnce(response({ name: "chatgpt-binding" }))
      .mockResolvedValueOnce(response({ name: "pending" }))
      .mockResolvedValueOnce(response({ number: 8, state: "open" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(checkChatGptVersion(env)).resolves.toMatchObject({
      outcome: "issue-reopened",
      issueNumber: 8,
    });
    expect(fetchMock.mock.calls.at(-1)?.[1]?.method).toBe("PATCH");
  });

  it("replaces a deleted recorded issue instead of keeping a permanent claim", async () => {
    const { env, claims } = environment();
    claims.rows.set(claimIdentity(latest), {
      state: "issue",
      issue_number: 9,
      lease_expires_at: 0,
      updated_at: Math.floor(Date.now() / 1000),
    });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(feed(latest)))
      .mockResolvedValueOnce(response(bindingIndex()))
      .mockResolvedValueOnce(response(bindingManifest()))
      .mockResolvedValueOnce(response({ items: [] }))
      .mockResolvedValueOnce(response({}, 404))
      .mockResolvedValueOnce(response({ name: "chatgpt-binding" }))
      .mockResolvedValueOnce(response({ name: "pending" }))
      .mockResolvedValueOnce(response({
        ...trustedAuthor,
        number: 10,
        title: issueTitle(latest),
        body: issueBody(latest),
        state: "open",
      }, 201));
    vi.stubGlobal("fetch", fetchMock);

    await expect(checkChatGptVersion(env)).resolves.toMatchObject({
      outcome: "issue-created",
      issueNumber: 10,
    });
    expect(claims.rows.get(claimIdentity(latest))).toMatchObject({
      state: "issue",
      issue_number: 10,
    });
  });

  it("fails before version detection when the current binding manifest is absent", async () => {
    const { env } = environment();
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(response(feed(latest)))
      .mockResolvedValueOnce(response(bindingIndex()))
      .mockResolvedValueOnce(response({}, 404)));
    await expect(checkChatGptVersion(env)).rejects.toThrow(
      `missing manifest for ${current}`,
    );
  });

  it("keeps the lease and does not retry an ambiguous issue creation", async () => {
    const { env, claims } = environment();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(feed(latest)))
      .mockResolvedValueOnce(response(bindingIndex()))
      .mockResolvedValueOnce(response(bindingManifest()))
      .mockResolvedValueOnce(response({ items: [] }))
      .mockResolvedValueOnce(response({ name: "chatgpt-binding" }))
      .mockResolvedValueOnce(response({ name: "pending" }))
      .mockResolvedValueOnce(response("GitHub unavailable", 503));
    vi.stubGlobal("fetch", fetchMock);
    await expect(checkChatGptVersion(env)).rejects.toThrow(/GitHub request failed: 503/);
    expect(fetchMock).toHaveBeenCalledTimes(7);
    expect(claims.rows.get(claimIdentity(latest))).toMatchObject({ state: "creating" });
  });

  it("keeps the lease when a successful issue creation has an invalid body", async () => {
    const { env, claims } = environment();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(feed(latest)))
      .mockResolvedValueOnce(response(bindingIndex()))
      .mockResolvedValueOnce(response(bindingManifest()))
      .mockResolvedValueOnce(response({ items: [] }))
      .mockResolvedValueOnce(response({ name: "chatgpt-binding" }))
      .mockResolvedValueOnce(response({ name: "pending" }))
      .mockResolvedValueOnce(response("not-json", 201));
    vi.stubGlobal("fetch", fetchMock);

    await expect(checkChatGptVersion(env)).rejects.toThrow(
      /successful POST response body is invalid/,
    );
    expect(fetchMock).toHaveBeenCalledTimes(7);
    expect(claims.rows.get(claimIdentity(latest))).toMatchObject({ state: "creating" });
  });

  it("keeps the lease when issue creation returns an untrusted author", async () => {
    const { env, claims } = environment();
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(response(feed(latest)))
      .mockResolvedValueOnce(response(bindingIndex()))
      .mockResolvedValueOnce(response(bindingManifest()))
      .mockResolvedValueOnce(response({ items: [] }))
      .mockResolvedValueOnce(response({ name: "chatgpt-binding" }))
      .mockResolvedValueOnce(response({ name: "pending" }))
      .mockResolvedValueOnce(response({
        user: { login: "wrong-token-owner", type: "User" },
        number: 49,
        title: issueTitle(latest),
        body: issueBody(latest),
        state: "open",
      }, 201)));

    await expect(checkChatGptVersion(env)).rejects.toThrow(
      /configured trusted identity/,
    );
    expect(claims.rows.get(claimIdentity(latest))).toMatchObject({ state: "creating" });
  });

  it("keeps the lease when recording a trusted created issue fails", async () => {
    const { env, claims } = environment(new MemoryClaims(true));
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(response(feed(latest)))
      .mockResolvedValueOnce(response(bindingIndex()))
      .mockResolvedValueOnce(response(bindingManifest()))
      .mockResolvedValueOnce(response({ items: [] }))
      .mockResolvedValueOnce(response({ name: "chatgpt-binding" }))
      .mockResolvedValueOnce(response({ name: "pending" }))
      .mockResolvedValueOnce(response({
        ...trustedAuthor,
        number: 52,
        title: issueTitle(latest),
        body: issueBody(latest),
        state: "open",
      }, 201)));

    await expect(checkChatGptVersion(env)).rejects.toThrow(
      /D1 issue record failed/,
    );
    expect(claims.rows.get(claimIdentity(latest))).toMatchObject({
      state: "creating",
      issue_number: null,
    });
  });

  it("releases the lease after a deterministic issue creation rejection", async () => {
    const { env, claims } = environment();
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(response(feed(latest)))
      .mockResolvedValueOnce(response(bindingIndex()))
      .mockResolvedValueOnce(response(bindingManifest()))
      .mockResolvedValueOnce(response({ items: [] }))
      .mockResolvedValueOnce(response({ name: "chatgpt-binding" }))
      .mockResolvedValueOnce(response({ name: "pending" }))
      .mockResolvedValueOnce(response("Invalid issue", 422)));
    await expect(checkChatGptVersion(env)).rejects.toThrow(/GitHub request failed: 422/);
    expect(claims.rows.has(claimIdentity(latest))).toBe(false);
  });
});
