import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "API Documentation",
  description:
    "Actuarius public API: send a contact or demo enquiry programmatically. OpenAPI 3.1 description, request schema, validation rules and error codes.",
  alternates: { canonical: "/api-docs" },
  openGraph: { title: "API Documentation · Actuarius", url: "/api-docs" },
};

const ERRORS: [string, string, string][] = [
  ["400", "invalid_json", "Body is not valid JSON."],
  ["400", "invalid_name", "Name shorter than 2 characters."],
  ["400", "invalid_email", "Email address is not valid."],
  ["400", "invalid_message", "Message shorter than 10 characters."],
  ["403", "forbidden_origin", "Browser Origin header does not match the site. Server-to-server calls send no Origin and are accepted."],
  ["501", "email_not_configured", "Mail delivery is not configured on the server."],
  ["502", "email_send_failed", "The mail provider rejected the message."],
];

export default function ApiDocs() {
  return (
    <div className="min-h-screen" style={{ background: "#f4f3ef", color: "#191b20" }}>
      <header className="border-b" style={{ borderColor: "#e5e2db", background: "#fff" }}>
        <div className="max-w-3xl mx-auto px-6 h-16 flex items-center gap-3">
          <Link href="/" className="flex items-center gap-2.5 no-underline" style={{ color: "#191b20" }}>
            <img src="/logo-128.png" alt="" width={28} height={28} />
            <span className="font-extrabold tracking-tight text-[18px]">Actuarius</span>
          </Link>
          <span className="text-[13px]" style={{ color: "#5d6472" }}>· API</span>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-[32px] font-bold mb-3" style={{ letterSpacing: "-0.03em" }}>API Documentation</h1>
        <p className="text-[15px] leading-relaxed mb-8" style={{ color: "#5d6472" }}>
          Actuarius is an actuarial reserving platform. Reserving, cash flow, discounting and data
          management run behind an authenticated session and are not part of the public API. The
          endpoint below is open, so an agent acting for a user can get in touch without a browser.
        </p>

        <div className="rounded-xl border p-5 mb-10" style={{ borderColor: "#e5e2db", background: "#fff" }}>
          <p className="text-[11px] uppercase tracking-widest mb-2" style={{ color: "#a85a33" }}>Machine-readable</p>
          <p className="text-[14px] mb-1">
            OpenAPI 3.1: <a href="/openapi.json" className="underline" style={{ color: "#a85a33" }}>/openapi.json</a>
          </p>
          <p className="text-[14px]">
            API catalog (RFC 9727): <a href="/.well-known/api-catalog" className="underline" style={{ color: "#a85a33" }}>/.well-known/api-catalog</a>
          </p>
        </div>

        <h2 className="text-[20px] font-bold mb-2" style={{ letterSpacing: "-0.02em" }}>POST /v1/contact</h2>
        <p className="text-[14.5px] leading-relaxed mb-4" style={{ color: "#5d6472" }}>
          Sends a contact or demo enquiry. No authentication. The reply goes to the address in{" "}
          <code style={{ background: "#f9efe8", color: "#a85a33", padding: "1px 5px", borderRadius: 4 }}>email</code>.
        </p>

        <pre className="rounded-xl border p-4 overflow-x-auto text-[12.5px] leading-relaxed mb-8"
             style={{ borderColor: "#e5e2db", background: "#fff" }}>
{`curl -X POST https://reserve-agent-worker-production.l5819033.workers.dev/v1/contact \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "Jane Actuary",
    "email": "jane@insurer.example",
    "company": "Example Insurance",
    "message": "We reserve 12 lines quarterly and would like to see the agent run a close."
  }'`}
        </pre>

        <h3 className="text-[16px] font-semibold mb-3">Request fields</h3>
        <div className="rounded-xl border overflow-hidden mb-8" style={{ borderColor: "#e5e2db", background: "#fff" }}>
          {[
            ["name", "string, required", "2–80 characters."],
            ["email", "string, required", "Valid address, max 160 characters. Used as reply-to."],
            ["company", "string, optional", "Max 120 characters."],
            ["message", "string, required", "10–4000 characters."],
            ["website", "string, optional", "Honeypot. Leave empty — a filled value is silently discarded."],
          ].map(([f, t, d]) => (
            <div key={f} className="grid gap-2 px-4 py-3 border-b last:border-b-0 md:grid-cols-[130px_150px_1fr]"
                 style={{ borderColor: "#edeae4" }}>
              <code className="text-[13px]" style={{ color: "#a85a33" }}>{f}</code>
              <span className="text-[12.5px]" style={{ color: "#5d6472" }}>{t}</span>
              <span className="text-[13px]">{d}</span>
            </div>
          ))}
        </div>

        <h3 className="text-[16px] font-semibold mb-3">Responses</h3>
        <div className="rounded-xl border overflow-hidden mb-8" style={{ borderColor: "#e5e2db", background: "#fff" }}>
          <div className="grid gap-2 px-4 py-3 border-b md:grid-cols-[60px_180px_1fr]" style={{ borderColor: "#edeae4" }}>
            <code className="text-[13px] font-semibold">200</code>
            <code className="text-[12.5px]" style={{ color: "#5d6472" }}>{`{ "ok": true }`}</code>
            <span className="text-[13px]">Message delivered.</span>
          </div>
          {ERRORS.map(([code, err, desc]) => (
            <div key={err} className="grid gap-2 px-4 py-3 border-b last:border-b-0 md:grid-cols-[60px_180px_1fr]"
                 style={{ borderColor: "#edeae4" }}>
              <code className="text-[13px] font-semibold">{code}</code>
              <code className="text-[12.5px]" style={{ color: "#a85a33" }}>{err}</code>
              <span className="text-[13px]" style={{ color: "#5d6472" }}>{desc}</span>
            </div>
          ))}
        </div>

        <p className="text-[13.5px]" style={{ color: "#5d6472" }}>
          Questions: <a href="mailto:info@actuarius.com.tr" className="underline" style={{ color: "#a85a33" }}>info@actuarius.com.tr</a>
        </p>
      </main>

      <footer className="border-t" style={{ borderColor: "#e5e2db" }}>
        <div className="max-w-3xl mx-auto px-6 py-6 flex gap-5 text-[13px]" style={{ color: "#5d6472" }}>
          <Link href="/">Home</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
        </div>
      </footer>
    </div>
  );
}
