import test from "node:test";
import assert from "node:assert/strict";
import {
  buildExtensionLoginRedirectUrl,
  consumeExtensionExchangeCode,
  createExtensionExchangeCode,
  createExtensionSessionForConsumedCode,
  getAllowedChromeExtensionIds,
  hashExtensionExchangeCode,
  validateChromeIdentityRedirectUri,
} from "@/lib/extension/web-session-auth-core";

function withEnv<T>(key: string, value: string | undefined, fn: () => T) {
  const previous = process.env[key];
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }

  try {
    return fn();
  } finally {
    if (previous === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = previous;
    }
  }
}

function createFakeInsertClient() {
  const calls: unknown[] = [];
  return {
    calls,
    from() {
      return {
        insert(payload: unknown) {
          calls.push(payload);
          return Promise.resolve({ error: null });
        },
      };
    },
  };
}

function createFakeConsumeClient(row: Record<string, unknown> | null) {
  const state = { payload: null as Record<string, unknown> | null };
  return {
    state,
    from() {
      return {
        update(payload: Record<string, unknown>) {
          state.payload = payload;
          return {
            eq() {
              return this;
            },
            is() {
              return this;
            },
            gt() {
              return this;
            },
            select() {
              return {
                maybeSingle: async () => ({ data: row, error: null }),
              };
            },
          };
        },
      };
    },
  };
}

test("missing NYABAG_CHROME_EXTENSION_IDS returns a clear config error", () => {
  withEnv("NYABAG_CHROME_EXTENSION_IDS", undefined, () => {
    const result = getAllowedChromeExtensionIds();
    assert.equal(result.success, false);
    if (!result.success) {
      assert.equal(result.status, 500);
      assert.equal(result.error, "NYABAG_CHROME_EXTENSION_IDS is not configured");
    }
  });
});

test("allowed and disallowed Chrome extension IDs are validated strictly", () => {
  withEnv(
    "NYABAG_CHROME_EXTENSION_IDS",
    "abcdefghijklmnopabcdefghijklmnop",
    () => {
      const allowed = validateChromeIdentityRedirectUri(
        "https://abcdefghijklmnopabcdefghijklmnop.chromiumapp.org/nyabag-auth"
      );
      assert.equal(allowed.success, true);

      const query = validateChromeIdentityRedirectUri(
        "https://abcdefghijklmnopabcdefghijklmnop.chromiumapp.org/nyabag-auth?x=1"
      );
      assert.equal(query.success, false);

      const hash = validateChromeIdentityRedirectUri(
        "https://abcdefghijklmnopabcdefghijklmnop.chromiumapp.org/nyabag-auth#frag"
      );
      assert.equal(hash.success, false);

      const disallowed = validateChromeIdentityRedirectUri(
        "https://zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz.chromiumapp.org/nyabag-auth"
      );
      assert.equal(disallowed.success, false);
    }
  );
});

test("start-route login redirect preserves the original extension auth request", () => {
  const redirect = buildExtensionLoginRedirectUrl(
    new URL(
      "https://app.nyabag.com/api/extension/auth/start?redirect_uri=https%3A%2F%2Fabcdefghijklmnopabcdefghijklmnop.chromiumapp.org%2Fnyabag-auth&state=state_12345678901234"
    )
  );

  assert.equal(redirect.pathname, "/login");
  assert.equal(
    redirect.searchParams.get("next"),
    "/api/extension/auth/start?redirect_uri=https%3A%2F%2Fabcdefghijklmnopabcdefghijklmnop.chromiumapp.org%2Fnyabag-auth&state=state_12345678901234"
  );
});

test("exchange code creation stores only a hash and preserves redirect/state", async () => {
  const fakeClient = createFakeInsertClient();

  const result = await createExtensionExchangeCode({
    userId: "user-1",
    email: "user@example.com",
    redirectUri:
      "https://abcdefghijklmnopabcdefghijklmnop.chromiumapp.org/nyabag-auth",
    state: "state_12345678901234",
    supabaseClient: fakeClient as never,
  });

  assert.equal(fakeClient.calls.length, 1);
  assert.equal(result.expiresAt.length > 0, true);

  const payload = fakeClient.calls[0] as Record<string, string>;
  assert.equal(payload.user_id, "user-1");
  assert.equal(payload.email, "user@example.com");
  assert.equal(payload.redirect_uri, "https://abcdefghijklmnopabcdefghijklmnop.chromiumapp.org/nyabag-auth");
  assert.equal(payload.state, "state_12345678901234");
  assert.equal(payload.code_hash.length, 64);
});

test("exchange code consumption rejects mismatched, expired, and reused codes", async () => {
  const redirectUri =
    "https://abcdefghijklmnopabcdefghijklmnop.chromiumapp.org/nyabag-auth";
  const code = "A".repeat(43);
  const consumeClient = createFakeConsumeClient({
    user_id: "user-1",
    email: "user@example.com",
    redirect_uri: redirectUri,
    state: "state_12345678901234",
    expires_at: new Date(Date.now() + 1000).toISOString(),
  });

  const consumed = await consumeExtensionExchangeCode({
    code,
    redirectUri,
    supabaseClient: consumeClient as never,
  });

  assert.equal(consumed?.user_id, "user-1");
  assert.equal(consumeClient.state.payload && "consumed_at" in consumeClient.state.payload, true);
  assert.equal(hashExtensionExchangeCode(code).length, 64);

  const reused = createFakeConsumeClient(null);
  const missing = await consumeExtensionExchangeCode({
    code,
    redirectUri,
    supabaseClient: reused as never,
  });
  assert.equal(missing, null);
});

test("successful consumed code mints an extension session", async () => {
  const session = await createExtensionSessionForConsumedCode(
    {
      user_id: "user-1",
      email: "user@example.com",
      redirect_uri:
        "https://abcdefghijklmnopabcdefghijklmnop.chromiumapp.org/nyabag-auth",
      state: "state_12345678901234",
      expires_at: new Date(Date.now() + 1000).toISOString(),
    },
    {
      admin: {
        auth: {
          admin: {
            generateLink: async () => ({
              data: {
                user: { id: "user-1" },
                properties: { hashed_token: "hashed-token" },
              },
              error: null,
            }),
          },
        },
      } as never,
      auth: {
        auth: {
          verifyOtp: async () => ({
            data: {
              user: { id: "user-1", email: "user@example.com" },
              session: {
                access_token: "access",
                refresh_token: "refresh",
                expires_at: 123,
                expires_in: 3600,
                token_type: "bearer",
              },
            },
            error: null,
          }),
        },
      } as never,
    }
  );

  assert.equal(session.user.id, "user-1");
  assert.equal(session.session.access_token, "access");
  assert.equal(session.session.refresh_token, "refresh");
});
