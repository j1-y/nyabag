"use client";

import { HugeIcon } from "@/components/ui/huge-icon";
import { IconArrowUpRight, IconLinkAlt, IconPlug, IconSend } from "@/components/ui/icons";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
;
import { createTelegramConnectionCode, disconnectTelegram, getTelegramConnection } from "@/lib/actions";
import type { TelegramConnection } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type TelegramConnectionState = {
  configured: boolean;
  connection: TelegramConnection | null;
  botUrl?: string;
};

type TelegramCapturePanelProps = {
  initial: TelegramConnectionState;
};

const PENDING_POLL_INTERVAL_MS = 3000;
const PENDING_POLL_TIMEOUT_MS = 3 * 60 * 1000;

function formatDate(value: string | null) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Kolkata",
  }).format(new Date(value));
}

function displayName(connection: TelegramConnection) {
  if (connection.telegram_username) return `@${connection.telegram_username}`;
  return [connection.first_name, connection.last_name].filter(Boolean).join(" ") || "Telegram";
}

export function TelegramCapturePanel({ initial }: TelegramCapturePanelProps) {
  const [state, setState] = useState(initial);
  const [code, setCode] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const pendingStartedAtRef = useRef<number | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isPending, startTransition] = useTransition();
  const connection = state.connection;
  const activeExpiresAt = expiresAt ?? connection?.verification_code_expires_at ?? null;

  const statusLabel = useMemo(() => {
    if (!state.configured) return "Not configured";
    if (!connection) return "Not connected";
    if (connection.status === "connected") return "Connected";
    if (connection.status === "pending") return "Pending";
    return "Disabled";
  }, [connection, state.configured]);

  useEffect(() => {
    if (!state.configured || connection?.status !== "pending") return;

    if (!pendingStartedAtRef.current) {
      pendingStartedAtRef.current = Date.now();
    }

    let cancelled = false;
    const startedAt = pendingStartedAtRef.current;

    async function refreshConnection() {
      const now = Date.now();
      if (now - startedAt > PENDING_POLL_TIMEOUT_MS) return;
      if (activeExpiresAt && new Date(activeExpiresAt).getTime() <= now) return;

      const result = await getTelegramConnection();
      if (cancelled || !result.success) return;

      setState(result.data);
      if (result.data.connection?.status === "connected") {
        setCode(null);
        setExpiresAt(null);
        pendingStartedAtRef.current = null;
        setError("");
        setSuccess("Telegram connected");
      }
    }

    const interval = window.setInterval(refreshConnection, PENDING_POLL_INTERVAL_MS);
    void refreshConnection();

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [activeExpiresAt, connection?.status, state.configured]);

  function generateCode() {
    setError("");
    setSuccess("");

    startTransition(async () => {
      const result = await createTelegramConnectionCode();
      if (!result.success) {
        setError(result.error);
        return;
      }

      setCode(result.data.code);
      setExpiresAt(result.data.expiresAt);
      pendingStartedAtRef.current = Date.now();
      setState((current) => ({
        ...current,
        configured: true,
        botUrl: result.data.botUrl ?? current.botUrl,
        connection: current.connection
          ? {
              ...current.connection,
              status: "pending",
              telegram_user_id: null,
              telegram_chat_id: null,
              telegram_username: null,
              first_name: null,
              last_name: null,
              connected_at: null,
              disconnected_at: null,
              verification_code_expires_at: result.data.expiresAt,
            }
          : {
              id: "",
              user_id: "",
              telegram_user_id: null,
              telegram_chat_id: null,
              telegram_username: null,
              first_name: null,
              last_name: null,
              status: "pending",
              verification_code_expires_at: result.data.expiresAt,
              connected_at: null,
              disconnected_at: null,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
      }));
      setSuccess("Connection code generated");
    });
  }

  function disconnect() {
    setError("");
    setSuccess("");

    startTransition(async () => {
      const result = await disconnectTelegram();
      if (!result.success) {
        setError(result.error);
        return;
      }

      setCode(null);
      setExpiresAt(null);
      pendingStartedAtRef.current = null;
      setState((current) => ({
        ...current,
        connection: current.connection
          ? {
              ...current.connection,
              status: "disabled",
              verification_code_expires_at: null,
              disconnected_at: new Date().toISOString(),
            }
          : null,
      }));
      setSuccess("Telegram disconnected");
    });
  }

  return (
    <section className="profile-panel telegram-capture-panel" aria-label="Telegram Capture">
      <div className="profile-panel-header telegram-capture-header">
        <div>
          <h2>Telegram Capture</h2>
          <p>Send URLs to your Nyabag bot and save them automatically.</p>
        </div>
        <Badge variant={connection?.status === "connected" ? "success" : state.configured ? "subtle" : "warning"}>
          {statusLabel}
        </Badge>
      </div>

      {error && <div className="profile-message profile-message-error">{error}</div>}
      {success && <div className="profile-message profile-message-success">{success}</div>}

      {!state.configured ? (
        <div className="telegram-capture-state">
          <p>Telegram integration is not configured.</p>
        </div>
      ) : connection?.status === "connected" ? (
        <div className="telegram-capture-state">
          <div className="telegram-capture-detail">
            <HugeIcon icon={IconPlug} size={18} />
            <div>
              <strong>Connected as {displayName(connection)}</strong>
              <span>{connection.connected_at ? `Connected ${formatDate(connection.connected_at)}` : "Ready to save links"}</span>
            </div>
          </div>
          <p>Send any URL to the bot to save it.</p>
        </div>
      ) : connection?.status === "pending" || code ? (
        <div className="telegram-capture-state">
          {code && <div className="telegram-code">{code}</div>}
          <p>Open the bot and send this code. Once connected, any URL you send there will be saved to Nyabag.</p>
          <span className="telegram-expiry">Waiting for the bot to confirm the code...</span>
          {activeExpiresAt && (
            <span className="telegram-expiry">
              Expires {formatDate(activeExpiresAt)}
            </span>
          )}
        </div>
      ) : (
        <div className="telegram-capture-state">
          <p>Generate a connection code, send it to the bot, then start saving links from Telegram.</p>
        </div>
      )}

      <div className="telegram-capture-actions">
        {state.configured && connection?.status !== "connected" && (
          <Button type="button" onClick={generateCode} disabled={isPending}>
            <HugeIcon icon={IconSend} size={18} />
            {connection?.status === "pending" || code ? "Regenerate code" : "Generate code"}
          </Button>
        )}

        {state.botUrl && state.configured && (
          <Button type="button" variant="outline" asChild>
            <a href={state.botUrl} target="_blank" rel="noreferrer">
              <HugeIcon icon={IconArrowUpRight} size={18} />
              Open Telegram bot
            </a>
          </Button>
        )}

        {connection?.status === "connected" && (
          <Button type="button" variant="outline" onClick={disconnect} disabled={isPending}>
            <HugeIcon icon={IconLinkAlt} size={18} />
            Disconnect Telegram
          </Button>
        )}
      </div>
    </section>
  );
}
