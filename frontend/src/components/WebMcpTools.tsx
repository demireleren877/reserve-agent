"use client";

import { useEffect } from "react";
import type { LandingContent } from "@/lib/content/landing";

/**
 * WebMCP — sayfayı ziyaret eden tarayıcı ajanına sitenin gerçek eylemlerini açar.
 *
 * Tanımlar landing sözlüğünden (`c`) besleniyor; ajan ile ekranda görünen metin
 * asla ayrışmasın diye ikinci bir içerik kopyası tutulmuyor. Diller de kendi
 * sözlüğünü kullanır: /en'de ajan İngilizce yanıt alır.
 *
 * API iki isimle dolaşımda: taslak `document.modelContext.registerTool()` ve
 * Chrome ön izlemesindeki `navigator.modelContext.provideContext({tools})`.
 * İkisi de yoksa bileşen hiçbir şey yapmaz — ilerici geliştirme.
 */

type Tool = {
  name: string;
  title?: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute: (input: Record<string, unknown>) => unknown | Promise<unknown>;
  annotations?: { readOnlyHint?: boolean };
};

type ModelContext = {
  registerTool?: (tool: Tool, options?: { signal?: AbortSignal }) => Promise<void> | void;
  provideContext?: (context: { tools: Tool[] }) => Promise<void> | void;
};

const EMPTY = { type: "object", properties: {}, additionalProperties: false } as const;

export function WebMcpTools({
  c,
  onFillContact,
}: {
  c: LandingContent;
  onFillContact: (fields: { name: string; email: string; company: string; message: string }) => void;
}) {
  useEffect(() => {
    const ctx: ModelContext | undefined =
      (document as unknown as { modelContext?: ModelContext }).modelContext ??
      (navigator as unknown as { modelContext?: ModelContext }).modelContext;
    if (!ctx) return;

    const en = c.locale === "en";

    const tools: Tool[] = [
      {
        name: "actuarius_list_modules",
        title: en ? "List Actuarius modules" : "Actuarius modüllerini listele",
        description: en
          ? "List the four modules of the Actuarius actuarial reserving platform (Data, Reserving, Cash Flow, Discounting) with what each one does and its current status."
          : "Actuarius aktüeryal rezerv platformunun dört modülünü (Veri, Rezerv, Nakit Akışı, İskonto) ne yaptıkları ve mevcut durumlarıyla birlikte listeler.",
        inputSchema: EMPTY,
        annotations: { readOnlyHint: true },
        execute: () => ({
          modules: c.modules.items.map((m) => ({ name: m.t, status: m.s, description: m.d })),
          agentTools: c.agent.tools.map((t) => ({ module: t.m, toolCount: t.n, covers: t.d })),
        }),
      },
      {
        name: "actuarius_get_pricing",
        title: en ? "Get Actuarius pricing" : "Actuarius fiyatlandırmasını getir",
        description: en
          ? "Get the Actuarius pricing plans (Free, Pro, Enterprise) with price, billing period and what each plan includes."
          : "Actuarius fiyat planlarını (Free, Pro, Enterprise) fiyat, dönem ve plan kapsamıyla birlikte getirir.",
        inputSchema: EMPTY,
        annotations: { readOnlyHint: true },
        execute: () => ({
          plans: c.pricing.plans.map((p) => ({
            name: p.n,
            price: p.p,
            period: p.s,
            includes: p.f,
          })),
        }),
      },
      {
        name: "actuarius_search_faq",
        title: en ? "Search the Actuarius FAQ" : "Actuarius SSS içinde ara",
        description: en
          ? "Search the Actuarius FAQ for answers about supported reserving methods, the AI agent, data security, IFRS 17 and deployment. Returns every entry when no query is given."
          : "Desteklenen rezerv yöntemleri, AI agent, veri güvenliği, IFRS 17 ve kurulum hakkındaki soruları Actuarius SSS içinde arar. Sorgu verilmezse tüm kayıtları döndürür.",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: en
                ? "Optional keyword to filter questions and answers."
                : "Soru ve cevapları süzmek için isteğe bağlı anahtar kelime.",
            },
          },
          additionalProperties: false,
        },
        annotations: { readOnlyHint: true },
        execute: ({ query }) => {
          const q = typeof query === "string" ? query.trim().toLocaleLowerCase(c.locale) : "";
          const items = q
            ? c.faq.items.filter((i) =>
                `${i.q} ${i.a}`.toLocaleLowerCase(c.locale).includes(q),
              )
            : c.faq.items;
          return { count: items.length, items };
        },
      },
      {
        name: "actuarius_prepare_contact_message",
        title: en ? "Prepare a message to Actuarius" : "Actuarius'a mesaj hazırla",
        description: en
          ? "Fill the Actuarius contact form with the user's details and scroll to it. This does NOT send anything — the user reviews the text and presses the send button themselves."
          : "Actuarius iletişim formunu kullanıcının bilgileriyle doldurur ve forma kaydırır. Gönderim YAPMAZ — metni kullanıcı görür ve gönder düğmesine kendisi basar.",
        inputSchema: {
          type: "object",
          properties: {
            name: { type: "string", description: en ? "Full name of the person getting in touch." : "İletişime geçen kişinin adı soyadı." },
            email: { type: "string", description: en ? "Reply address. Ask the user; never invent one." : "Yanıt adresi. Kullanıcıya sorun, uydurmayın." },
            company: { type: "string", description: en ? "Company name (optional)." : "Şirket adı (isteğe bağlı)." },
            message: { type: "string", description: en ? "The message, at least 10 characters." : "Mesaj metni, en az 10 karakter." },
          },
          required: ["name", "email", "message"],
          additionalProperties: false,
        },
        execute: (input) => {
          const str = (v: unknown) => (typeof v === "string" ? v : "");
          onFillContact({
            name: str(input.name),
            email: str(input.email),
            company: str(input.company),
            message: str(input.message),
          });
          document.getElementById("contact")?.scrollIntoView({ behavior: "smooth" });
          return {
            status: "awaiting_user_confirmation",
            message: en
              ? "The contact form is filled and visible. Ask the user to review it and press the send button — nothing has been sent yet."
              : "İletişim formu dolduruldu ve ekranda. Kullanıcıdan gözden geçirip gönder düğmesine basmasını isteyin — henüz hiçbir şey gönderilmedi.",
          };
        },
      },
    ];

    const controller = new AbortController();

    if (typeof ctx.registerTool === "function") {
      for (const tool of tools) {
        // Kayıt reddedilirse (izin yok, ad çakışması) sayfa çalışmaya devam etsin.
        Promise.resolve(ctx.registerTool(tool, { signal: controller.signal })).catch(() => {});
      }
    } else if (typeof ctx.provideContext === "function") {
      Promise.resolve(ctx.provideContext({ tools })).catch(() => {});
    }

    return () => {
      controller.abort();
      // provideContext'in signal'i yok; boş liste vererek geri alıyoruz.
      if (typeof ctx.registerTool !== "function" && typeof ctx.provideContext === "function") {
        Promise.resolve(ctx.provideContext({ tools: [] })).catch(() => {});
      }
    };
  }, [c, onFillContact]);

  return null;
}
