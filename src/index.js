
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

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization"
    }
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
  if (result?.output_text) return result.output_text;
  return JSON.stringify(result);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization"
        }
      });
    }

    if (url.pathname.startsWith("/api/")) {
      if (
        url.pathname === "/api/health" ||
        url.pathname === "/api/hello"
      ) {
        return json({
          success: true,
          assistant: "FERIDE AI",
          status: "online",
          chat: "ready",
          image: "ready"
        });
      }

      if (url.pathname === "/api/chat" && request.method === "POST") {
        try {
          if (!env.AI) {
            return json({
              success: false,
              error: "La liaison Cloudflare AI (AI) n'est pas configurée."
            }, 500);
          }

          const body = await readBody(request);

          if (!body) {
            return json({
              success: false,
              error: "Données JSON invalides."
            }, 400);
          }

          const prompt = String(
            body.prompt || body.message || ""
          ).trim();

          if (!prompt) {
            return json({
              success: false,
              error: "Écrivez votre message."
            }, 400);
          }

          if (prompt.length > 4000) {
            return json({
              success: false,
              error: "Message trop long (maximum 4000 caractères)."
            }, 400);
          }

          const history = Array.isArray(body.history)
            ? body.history.slice(-10)
            : [];

          const messages = [
            { role: "system", content: SYSTEM_PROMPT },
            ...history
              .filter(item =>
                item &&
                ["user", "assistant"].includes(item.role) &&
                typeof item.content === "string"
              )
              .map(item => ({
                role: item.role,
                content: item.content.slice(0, 4000)
              })),
            { role: "user", content: prompt }
          ];

          const result = await env.AI.run(MODEL_CHAT, {
            messages,
            max_tokens: 1200
          });

          return json({
            success: true,
            assistant: "FERIDE AI",
            response: getText(result)
          });

        } catch (error) {
          return json({
            success: false,
            error: "Erreur pendant la réponse de FERIDE AI.",
            details: String(error?.message || error)
          }, 500);
        }
      }

      if (url.pathname === "/api/image" && request.method === "POST") {
        try {
          if (!env.AI) {
            return json({
              success: false,
              error: "Cloudflare AI n'est pas configuré."
            }, 500);
          }

          const body = await readBody(request);

          if (!body) {
            return json({
              success: false,
              error: "Données invalides."
            }, 400);
          }

          const prompt = String(body.prompt || "").trim();

          if (!prompt) {
            return json({
              success: false,
              error: "Décrivez l'image à créer."
            }, 400);
          }

          if (prompt.length > 2000) {
            return json({
              success: false,
              error: "Description trop longue."
            }, 400);
          }

          const result = await env.AI.run(MODEL_IMAGE, {
            prompt,
            width: 1024,
            height: 768
          });

          let imageData = null;

          if (result instanceof ReadableStream) {
            const buffer = await new Response(result).arrayBuffer();
            imageData = btoa(
              String.fromCharCode(...new Uint8Array(buffer))
            );
          } else if (result instanceof ArrayBuffer) {
            imageData = btoa(
              String.fromCharCode(...new Uint8Array(result))
            );
          } else if (result?.image) {
            imageData = result.image;
          }

          if (!imageData) {
            return json({
              success: false,
              error: "Le modèle n'a pas retourné d'image."
            }, 500);
          }

          return json({
            success: true,
            image: `data:image/png;base64,${imageData}`
          });

        } catch (error) {
          return json({
            success: false,
            error: "Erreur pendant la génération de l'image.",
            details: String(error?.message || error)
          }, 500);
        }
      }

      return json({
        success: false,
        error: "Route API introuvable."
      }, 404);
    }

    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response("FERIDE AI - Interface introuvable.", {
      status: 404
    });
  }
};
