
const MODEL_CHAT = "@cf/google/gemma-4-26b-a4b-it";
const MODEL_IMAGE = "@cf/black-forest-labs/flux-2-klein-4b";

const SYSTEM_PROMPT = `
Tu es FERIDE AI, un assistant intelligent et polyvalent.

Tes missions :
- Comprendre les demandes et le contexte des utilisateurs.
- Répondre en français ou dans la langue utilisée.
- Donner des explications simples ou détaillées selon la demande.
- Aider en informatique, programmation, technologie et sciences.
- Analyser les images envoyées et décrire ce qui est visible.
- Être honnête lorsque tu ne connais pas une information.
- Ne jamais prétendre avoir effectué une action qui n'a pas été réalisée.

Tu dois être clair, précis, utile et respectueux.
`;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    }
  });
}

function getImageData(dataUrl) {
  if (typeof dataUrl !== "string") {
    throw new Error("Image manquante.");
  }

  const match = dataUrl.match(
    /^data:(image\/(?:png|jpeg|jpg|webp));base64,([A-Za-z0-9+/=]+)$/
  );

  if (!match) {
    throw new Error("Format d'image non accepté.");
  }

  const mime = match[1] === "image/jpg"
    ? "image/jpeg"
    : match[1];

  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return { bytes, mime };
}

function extractText(result) {
  if (typeof result === "string") return result;

  return (
    result?.response ??
    result?.result?.response ??
    result?.choices?.[0]?.message?.content ??
    result?.output_text ??
    JSON.stringify(result)
  );
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type"
        }
      });
    }

    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/") {
      return json({
        name: "FERIDE AI",
        status: "online",
        functions: [
          "conversation",
          "image-analysis",
          "image-editing"
        ]
      });
    }

    if (!env.AI) {
      return json({
        error: "Le service Workers AI n'est pas configuré."
      }, 500);
    }

    if (request.method !== "POST") {
      return json({ error: "Méthode non autorisée." }, 405);
    }

    let body;

    try {
      body = await request.json();
    } catch {
      return json({ error: "Le contenu JSON est invalide." }, 400);
    }

    try {

      // 1. CONVERSATION ET ANALYSE DES PHOTOS

      if (url.pathname === "/chat") {
        const message = body.message;
        const history = Array.isArray(body.history)
          ? body.history.slice(-12)
          : [];

        if (!message && !body.image) {
          return json({
            error: "Écris un message ou ajoute une photo."
          }, 400);
        }

        const messages = [
          {
            role: "system",
            content: SYSTEM_PROMPT
          },
          ...history
            .filter(item =>
              ["user", "assistant"].includes(item.role)
            )
            .map(item => ({
              role: item.role,
              content: String(item.content || "")
            }))
        ];

        let content;

        if (body.image) {
          const image = getImageData(body.image);

          content = [
            {
              type: "text",
              text: message || "Analyse cette image et explique ce que tu observes."
            },
            {
              type: "image_url",
              image_url: {
                url: body.image
              }
            }
          ];
        } else {
          content = message;
        }

        messages.push({
          role: "user",
          content
        });

        const result = await env.AI.run(MODEL_CHAT, {
          messages,
          max_tokens: 1500,
          temperature: 0.6
        });

        return json({
          success: true,
          reply: extractText(result)
        });
      }

      // 2. MODIFICATION OU GÉNÉRATION D'IMAGE

      if (url.pathname === "/edit-image") {
        const prompt = body.prompt;

        if (!prompt || typeof prompt !== "string") {
          return json({
            error: "Décris la modification souhaitée."
          }, 400);
        }

        const form = new FormData();

        form.set("prompt", prompt);

        if (body.image) {
          const image = getImageData(body.image);

          form.set(
            "input_image_0",
            new Blob([image.bytes], { type: image.mime }),
            "photo-reference"
          );
        }

        form.set("width", "1024");
        form.set("height", "768");

        const multipartResponse = new Response(form);

        const result = await env.AI.run(MODEL_IMAGE, {
          multipart: {
            body: multipartResponse.body,
            contentType: multipartResponse.headers.get("content-type")
          }
        });

        let imageResult =
          result?.image ??
          result?.result?.image ??
          result;

        if (imageResult instanceof Uint8Array) {
          imageResult = btoa(
            Array.from(imageResult, byte =>
              String.fromCharCode(byte)
            ).join("")
          );
        }

        if (imageResult instanceof ArrayBuffer) {
          const bytes = new Uint8Array(imageResult);
          imageResult = btoa(
            Array.from(bytes, byte =>
              String.fromCharCode(byte)
            ).join("")
          );
        }

        if (typeof imageResult !== "string") {
          return json({
            error: "Le modèle n'a pas retourné une image exploitable."
          }, 502);
        }

        if (imageResult.startsWith("data:image/")) {
          return json({
            success: true,
            image: imageResult
          });
        }

        return json({
          success: true,
          image: "data:image/png;base64," + imageResult
        });
      }

      return json({
        error: "Route inconnue."
      }, 404);

    } catch (error) {
      return json({
        success: false,
        error: error.message || "Une erreur est survenue."
      }, 500);
    }
  }
};
