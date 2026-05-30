import React, { useEffect, useRef, useState } from "react";
import { Mail, Lock, LogIn, Send, ArrowRight } from "lucide-react";
import { FormField } from "@/components/auth/FormField";
import { PasswordToggle } from "@/components/auth/PasswordToggle";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { ServerError } from "@/components/auth/ServerError";

interface Props {
  serverError?: string | null;
  next?: string | null;
  unconfirmedEmail?: string | null;
}

const RESEND_FALLBACK_SECONDS = 60;

type ResendStatus = "idle" | "sending" | "sent" | "error";

export default function SignInForm({ serverError, next, unconfirmedEmail }: Props) {
  const [email, setEmail] = useState(unconfirmedEmail ?? "");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});

  const isUnconfirmedFlow = serverError === "unconfirmed";

  const [resendCountdown, setResendCountdown] = useState(0);
  const [resendStatus, setResendStatus] = useState<ResendStatus>("idle");
  const [resendMessage, setResendMessage] = useState<string | null>(null);
  // Mount-only ticker: one setInterval for the component lifetime,
  // reads countdown via state-setter callback so the effect doesn't
  // need a dependency on the value itself. Strict Mode safe (cleanup
  // clears the interval; re-mount creates exactly one new one).
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Synchronous in-flight flag — React state flush is async, so a
  // pure `resendStatus === "sending"` guard allows two same-tick
  // clicks to both pass. The ref flips synchronously and immunises.
  const resendInFlightRef = useRef(false);

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setResendCountdown((prev) => (prev <= 0 ? 0 : prev - 1));
    }, 1000);
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, []);

  function validate() {
    const next: typeof errors = {};
    if (!email.trim()) {
      next.email = "Email is required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      next.email = "Enter a valid email address";
    }
    if (!password) {
      next.password = "Password is required";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function clearError(field: keyof typeof errors) {
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    if (!validate()) {
      e.preventDefault();
    }
  }

  async function handleResend() {
    if (resendInFlightRef.current || resendCountdown > 0) return;
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setResendStatus("error");
      setResendMessage("Enter a valid email address above first.");
      return;
    }
    resendInFlightRef.current = true;
    setResendStatus("sending");
    setResendMessage(null);
    try {
      const body = new FormData();
      body.set("email", email);
      const res = await fetch("/api/auth/resend", { method: "POST", body });
      if (res.status === 200) {
        setResendStatus("sent");
        setResendMessage("Confirmation email sent — check your inbox.");
        setResendCountdown(RESEND_FALLBACK_SECONDS);
      } else if (res.status === 429) {
        const data = (await res.json().catch(() => ({}))) as { retryAfterSeconds?: number };
        const wait = data.retryAfterSeconds ?? RESEND_FALLBACK_SECONDS;
        setResendStatus("idle");
        setResendMessage(`Please wait before requesting again.`);
        setResendCountdown(wait);
      } else if (res.status === 400) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setResendStatus("error");
        setResendMessage(data.error ?? "Invalid email address.");
      } else {
        setResendStatus("error");
        setResendMessage("Couldn't send right now. Try again in a moment.");
      }
    } catch {
      setResendStatus("error");
      setResendMessage("Network error — check your connection and retry.");
    } finally {
      resendInFlightRef.current = false;
    }
  }

  const resendDisabled = resendCountdown > 0 || resendStatus === "sending";
  const resendLabel =
    resendCountdown > 0
      ? `Send again (${resendCountdown}s)`
      : resendStatus === "sending"
        ? "Sending..."
        : "Send confirmation again";

  return (
    <form method="POST" action="/api/auth/signin" className="space-y-4" onSubmit={handleSubmit} noValidate>
      {next && <input type="hidden" name="next" value={next} />}
      <FormField
        id="email"
        type="email"
        label="Email"
        value={email}
        onChange={(v) => {
          setEmail(v);
          clearError("email");
        }}
        placeholder="you@example.com"
        error={errors.email}
        icon={<Mail className="size-4" />}
      />

      <FormField
        id="password"
        label="Password"
        type={showPassword ? "text" : "password"}
        value={password}
        onChange={(v) => {
          setPassword(v);
          clearError("password");
        }}
        placeholder="Your password"
        error={errors.password}
        icon={<Lock className="size-4" />}
        endContent={
          <PasswordToggle
            visible={showPassword}
            onToggle={() => {
              setShowPassword(!showPassword);
            }}
          />
        }
      />

      {isUnconfirmedFlow ? (
        <div className="space-y-2 rounded-lg border border-yellow-400/30 bg-yellow-400/10 p-3 text-sm text-yellow-100">
          <p>Your email isn&apos;t confirmed yet. Enter the 6-digit code from your inbox, or request a new one.</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleResend}
              disabled={resendDisabled}
              className="inline-flex items-center gap-2 rounded-md bg-yellow-400/20 px-3 py-1.5 text-xs font-medium text-yellow-50 transition hover:bg-yellow-400/30 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Send className="size-3" />
              {resendLabel}
            </button>
            <a
              href={`/auth/confirm-email?email=${encodeURIComponent(email)}`}
              className="inline-flex items-center gap-2 rounded-md bg-yellow-400/20 px-3 py-1.5 text-xs font-medium text-yellow-50 transition hover:bg-yellow-400/30"
            >
              Enter code
              <ArrowRight className="size-3" />
            </a>
          </div>
          {resendMessage ? <p className="text-xs text-yellow-100/80">{resendMessage}</p> : null}
        </div>
      ) : (
        <ServerError message={serverError} />
      )}

      <SubmitButton pendingText="Signing in..." icon={<LogIn className="size-4" />}>
        Sign in
      </SubmitButton>
    </form>
  );
}
