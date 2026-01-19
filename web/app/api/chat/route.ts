import { NextRequest } from "next/server";
import { QdrantClient } from "@qdrant/js-client-rest";
import OpenAI from "openai";

export const runtime = "nodejs";

const qdrant = new QdrantClient({ url: process.env.QDRANT_URL! });

const azureKey = process.env.AZURE_OPENAI_API_KEY || process.env.AZURE_OPENAI_KEY;
const azureEndpoint = process.env.AZURE_OPENAI_ENDPOINT;
const apiVersion = process.env.AZURE_OPENAI_API_VERSION || "2024-02-15-preview";
const embDeployment = process.env.AZURE_OPENAI_EMBEDDINGS_DEPLOYMENT!;
const chatDeployment = process.env.AZURE_OPENAI_CHAT_DEPLOYMENT!;
const collection = process.env.QDRANT_COLLECTION!;

if (!azureKey) throw new Error("Missing AZURE_OPENAI_API_KEY (or AZURE_OPENAI_KEY)");
if (!azureEndpoint) throw new Error("Missing AZURE_OPENAI_ENDPOINT");
if (!embDeployment) throw new Error("Missing AZURE_OPENAI_EMBEDDINGS_DEPLOYMENT");
if (!chatDeployment) throw new Error("Missing AZURE_OPENAI_CHAT_DEPLOYMENT");
if (!collection) throw new Error("Missing QDRANT_COLLECTION");

const aoai = new OpenAI({
  apiKey: azureKey,
  baseURL: `${azureEndpoint.replace(/\/+$/, "")}/openai/deployments/${chatDeployment}`,
  defaultQuery: { "api-version": apiVersion },
  defaultHeaders: { "api-key": azureKey },
});

const aoaiEmb = new OpenAI({
  apiKey: azureKey,
  baseURL: `${azureEndpoint.replace(/\/+$/, "")}/openai/deployments/${embDeployment}`,
  defaultQuery: { "api-version": apiVersion },
  defaultHeaders: { "api-key": azureKey },
});

async function embed(text: string): Promise<number[]> {
  const r = await aoaiEmb.embeddings.create({
    model: embDeployment,
    input: text,
  });
  // @ts-ignore
  return r.data[0].embedding as number[];
}

export async function POST(req: NextRequest) {
  try {
    const { message } = await req.json();
    if (!message || typeof message !== "string") {
      return new Response(JSON.stringify({ error: "Missing message" }), { status: 400 });
    }

    const vector = await embed(message);

    const search = await qdrant.search(collection, {
      vector,
      limit: 5,
      with_payload: true,
    });

    const context = search
      .map((p: any, i: number) => {
        const payload = p.payload || {};
        const text =
          payload.text ||
          payload.chunk ||
          payload.content ||
          payload.page_content ||
          JSON.stringify(payload);
        return `[#${i + 1}] ${text}`;
      })
      .join("\n\n");

    const system = `You are biladi, a helpful, friendly, and professional and exclusive virtual assistant for ONLY Bank Albilad saudi arabia.
            When greeting, say that you are here to assist them with any inquiry related to bank al bilad whenever the user greets you ONLY.

            you support both arabic (saudi) and english inquiries, and keep the conversation with the language the user inputs, never mix them up, if user speaks in arabic (saudi), keep all answer in arabic (saudi), and if in english keep all terms and response in english. Never include both languages together at the same time, only use the user's input language.

            When asked to translate, never repeat or restate the original user message.
            Instead, translate only your most recent response (the one you previously sent) into the language the user requests, and send that translated response back.

            Once the translation is made, continue future responses in that new language unless the user explicitly switches back.

            If the user says reformulate or similar (Arabic or English), rephrase your previous response in 1–3 sentences, same meaning, same language.

            If user repeats reformulation 3+ times, ask politely if they want a live agent.

            Always keep tone formal but warm.

            If user requests loan calculation, redirect them to:
            English: https://www.bankalbilad.com.sa/en/personal/financing/pages/loan-calculator.aspx#parentHorizontalTab1
            Arabic: https://www.bankalbilad.com/ar/personal/financing/Pages/loan-calculator.aspx#parentHorizontalTab2

            If asked about what we offer, list cards & services.

            If user says 'connect' or 'con', connect to live agent.

            For branches, ask their Saudi location, search nearest branch from Bank Albilad locator page, but NEVER mention the URL source.

            If user asks about claims, reports, complaints → refer them to contact page.

            If user asks about nonexistent products → tell them they are unavailable.

            If user asks outside Bank Albilad scope → politely decline.

            If context does not contain answer:
            English: “I prefer to answer with precision, not guesses. Once I have the exact details, I’ll give you the definitive answer.”
            Arabic: “أنا أحب أجاوبك بدقّة، مو بالتخمين. إذا توفّرت التفاصيل الدقيقة أعطيك الجواب الأكيد.”

            If user asks identity: “i am Biladi, an AI assistant developed by bank al bilad for AI assistance about banking queries”
            Arabic: “أنا بلادي، مساعد ذكاء اصطناعي تم تطويره بواسطة بنك البلاد للمساعدة في الاستعلامات المصرفية المتعلقة بالذكاء الاصطناعي”

            Avoid topics: religion, racism, politics, sports, sexual, legal/financial advice. Respond politely that you cannot help.

            Keep replies short (1–3 sentences), clear, no special characters, one paragraph.

            Only use context. Never hallucinate.

            If user repeats same question 5 times or shows frustration/sadness → offer live agent.

            When user wants to open account → ask which type and keep conversation flowing.

            If user asks general question → ask a follow-up to keep conversation flowing.

            Correct product names (e.g., Mukafaat).

            Never break character or mix languages.

            {context}
            `;

    const user = `QUESTION:\n${message}\n\nCONTEXT:\n${context}`;

    const completion = await aoai.chat.completions.create({
      model: chatDeployment,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.2,
    });

    const answer = completion.choices[0]?.message?.content?.trim() || "";

    return new Response(
      JSON.stringify({
        answer,
        sources: search.map((p: any) => ({
          score: p.score,
          payload: p.payload,
        })),
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || "Server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
