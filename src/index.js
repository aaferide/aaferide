const MODEL_CHAT = "@cf/google/gemma-4-26b-a4b-it";
const MODEL_IMAGE = "@cf/black-forest-labs/flux-2-klein-4b";

const SYSTEM_PROMPT = `
Tu es FERIDE AI, un assistant intelligent, professionnel et polyvalent.
Tu réponds dans la langue utilisée par l'utilisateur.
Tu donnes des réponses claires, précises et adaptées à la question.
Tu aides en informatique, programmation, réseaux, Linux, Windows,
cybersécurité éthique, intelligence artificielle, électronique,
télécommunications et nouvelles technologies.
Tu expliques étape par étape aux débutants lorsque nécessaire.
Tu ne prétends jamais avoir effectué une action que tu n'as pas faite.
`;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization"
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...CORS }
  });
}

async function readBody(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function getText(result) {
  if (typeof result === "string") return result;
  if (result?.response) return result.response;
  if (result?.result?.response) return result.result.response;
  if (result?.choices?.[0]?.message?.content) return result.choices[0].message.content;
  if (result?.output_text) return result.output_text;
  return JSON.stringify(result);
}

// Conversion en base64 par morceaux (évite l'erreur "Maximum call stack size exceeded")
function toBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function dataUrlToBlob(dataUrl) {
  const [meta, b64] = String(dataUrl).split(",");
  const mime = (meta.match(/data:(.*?);/) || [])[1] || "image/jpeg";
  const binary = atob(b64 || "");
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

function imageMime(b64) {
  if (b64.startsWith("/9j/")) return "image/jpeg";
  if (b64.startsWith("UklGR")) return "image/webp";
  return "image/png";
}

async function handleChat(request, env) {
  if (!env.AI) {
    return json({ success: false, error: "La liaison Cloudflare AI (AI) n'est pas configurée." }, 500);
  }

  const body = await readBody(request);
  if (!body) return json({ success: false, error: "Données JSON invalides." }, 400);

  const prompt = String(body.prompt || body.message || "").trim();
  if (!prompt) return json({ success: false, error: "Écrivez votre message." }, 400);
  if (prompt.length > 15000) {
    return json({ success: false, error: "Message trop long (maximum 15000 caractères)." }, 400);
  }

  const history = Array.isArray(body.history) ? body.history.slice(-10) : [];

  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    ...history
      .filter(item =>
        item &&
        ["user", "assistant"].includes(item.role) &&
        typeof item.content === "string"
      )
      .map(item => ({ role: item.role, content: item.content.slice(0, 4000) })),
    { role: "user", content: prompt }
  ];

  const result = await env.AI.run(MODEL_CHAT, { messages, max_tokens: 1500 });

  return json({
    success: true,
    assistant: "FERIDE AI",
    response: getText(result)
  });
}

// Création d'image (texte seul) ou modification (avec "image" = data URL)
async function handleImage(request, env) {
  if (!env.AI) {
    return json({ success: false, error: "Cloudflare AI n'est pas configuré." }, 500);
  }

  const body = await readBody(request);
  if (!body) return json({ success: false, error: "Données invalides." }, 400);

  const prompt = String(body.prompt || "").trim();
  if (!prompt) return json({ success: false, error: "Décrivez l'image à créer." }, 400);
  if (prompt.length > 2000) return json({ success: false, error: "Description trop longue." }, 400);

  // FLUX.2 klein exige un envoi multipart/form-data, même avec un simple texte
  const form = new FormData();
  form.append("prompt", prompt);

  if (body.image) {
    form.append("input_image_0", dataUrlToBlob(body.image), "image.jpg");
  } else {
    form.append("width", "1024");
    form.append("height", "768");
  }

  const formResponse = new Response(form);
  const result = await env.AI.run(MODEL_IMAGE, {
    multipart: {
      body: formResponse.body,
      contentType: formResponse.headers.get("content-type")
    }
  });

  let imageData = null;

  if (result instanceof ReadableStream) {
    imageData = toBase64(await new Response(result).arrayBuffer());
  } else if (result instanceof ArrayBuffer) {
    imageData = toBase64(result);
  } else if (typeof result?.image === "string") {
    imageData = result.image;
  }

  if (!imageData) {
    return json({ success: false, error: "Le modèle n'a pas retourné d'image." }, 500);
  }

  if (imageData.startsWith("data:")) {
    return json({ success: true, image: imageData });
  }
  return json({ success: true, image: `data:${imageMime(imageData)};base64,${imageData}` });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS });
    }

    if (url.pathname.startsWith("/api/")) {
      try {
        if (url.pathname === "/api/health" || url.pathname === "/api/hello") {
          return json({
            success: true,
            assistant: "FERIDE AI",
            status: "online",
            chat: "ready",
            image: "ready"
          });
        }

        if (url.pathname === "/api/chat" && request.method === "POST") {
          return await handleChat(request, env);
        }

        if (
          (url.pathname === "/api/image" || url.pathname === "/api/edit-image") &&
          request.method === "POST"
        ) {
          return await handleImage(request, env);
        }

        return json({ success: false, error: "Route API introuvable." }, 404);
      } catch (error) {
        return json({
          success: false,
          error: "Erreur pendant le traitement par FERIDE AI.",
          details: String(error?.message || error)
        }, 500);
      }
    }

    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response("FERIDE AI - Interface introuvable.", { status: 404 });
  }
};
