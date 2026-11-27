
const MODEL_CHAT = "@cf/google/gemma-4-26b-a4b-it";
const MODEL_IMAGE = "@cf/black-forest-labs/flux-2-klein-4b";

const SYSTEM_PROMPT = `
Tu es FERIDE AI, un assistant intelligent, universel et polyvalent.

IDENTITÉ :
Tu t'appelles FERIDE AI.
Tu es un assistant personnel intelligent, serviable et professionnel.

TES CAPACITÉS :
- Conversation naturelle en français et autres langues.
- Informatique, programmation et développement logiciel.
- Windows, Linux, Android et réseaux.
- Intelligence artificielle et nouvelles technologies.
- Sciences, mathématiques et connaissances générales.
- Analyse des photos, captures d'écran et documents visuels.
- Aide aux études, au travail et aux projets.
- Explications simples ou approfondies selon la demande.
- Génération et modification d'images via ton service d'images.

COMPORTEMENT :
- Comprends le contexte des conversations.
- Utilise l'historique fourni pour garder le fil.
- Donne des réponses utiles, précises et structurées.
- Ne prétends jamais avoir effectué une action non réalisée.
- Signale honnêtement tes limites.
- Ne répète pas inutilement les mêmes réponses.
- Accompagne les débutants étape par étape.

Tu es FERIDE AI. Réponds naturellement et avec intelligence.
`;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function getImageData(dataUrl) {
  if (typeof dataUrl !== "string") {
    throw new Error("Aucune image reçue.");
  }

  const match = dataUrl.match(
    /^data:(image\/(?:png|jpeg|jpg|webp));base64,([A-Za-z0-9+/]+={0,2})$/
  );

  if (!match) {
    throw new Error("Format d'image invalide. Utilise PNG, JPG ou WEBP.");
  }

  if (dataUrl.length > 8_000_000) {
    throw new Error("Image trop volumineuse. Réduis sa taille.");
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

  const value =
    result?.response ??
    result?.result?.response ??
    result?.choices?.[0]?.message?.content ??
    result?.output_text;

  if (typeof value === "string") return value;

  if (Array.isArray(value)) {
    return value
      .map(item => item.text || "")
      .join("\n");
  }

  return "FERIDE AI n'a pas reçu de réponse exploitable.";
}

function extractGeneratedImage(result) {
  const image =
    result?.image ??
    result?.result?.image ??
    result?.images?.[0];

  if (typeof image === "string") return image;

  if (image instanceof Uint8Array) {
    let binary = "";
    const chunkSize = 8192;

    for (let i = 0; i < image.length; i += chunkSize) {
      binary += String.fromCharCode(
        ...image.subarray(i, i + chunkSize)
      );
    }

    return btoa(binary);
  }

  if (image instanceof ArrayBuffer) {
    return extractGeneratedImage({
      image: new Uint8Array(image),
    });
  }

  return null;
}

export default {
  async fetch(request, env) {

    // OPTIONS : autorisation des requêtes du navigateur
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: CORS_HEADERS,
      });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    // TEST DU SERVEUR
    if (request.method === "GET" && path === "/") {
      return json({
        success: true,
        name: "FERIDE AI",
        status: "online",
        version: "2.0",
        models: {
          chat: MODEL_CHAT,
          image: MODEL_IMAGE,
        },
        routes: [
          "/chat",
          "/edit-image",
        ],
      });
    }

    if (request.method !== "POST") {
      return json({
        success: false,
        error: "Méthode non autorisée.",
      }, 405);
    }

    if (!env.AI) {
      return json({
        success: false,
        error: "Workers AI n'est pas configuré. Vérifie le binding AI.",
      }, 500);
    }

    let body;

    try {
      body = await request.json();
    } catch {
      return json({
        success: false,
        error: "Requête JSON invalide.",
      }, 400);
    }

    try {

      // =====================================
      // 1. CHAT ET ANALYSE DES IMAGES
      // =====================================

      if (path === "/chat") {

        const message = typeof body.message === "string"
          ? body.message.trim()
          : "";

        const history = Array.isArray(body.history)
          ? body.history.slice(-12)
          : [];

        if (!message && !body.image) {
          return json({
            success: false,
            error: "Écris un message ou envoie une photo.",
          }, 400);
        }

        const messages = [
          {
            role: "system",
            content: SYSTEM_PROMPT,
          },
        ];

        for (const item of history) {
          if (
            item &&
            ["user", "assistant"].includes(item.role) &&
            typeof item.content === "string"
          ) {
            messages.push({
              role: item.role,
              content: item.content.slice(0, 12000),
            });
          }
        }

        let content = message;

        if (body.image) {
          getImageData(body.image);

          content = [
            {
              type: "text",
              text: message ||
                "Analyse cette image en détail et explique ce que tu observes.",
            },
            {
              type: "image_url",
              image_url: {
                url: body.image,
              },
            },
          ];
        }

        messages.push({
          role: "user",
          content,
        });

        const result = await env.AI.run(MODEL_CHAT, {
          messages,
          max_tokens: 2000,
          temperature: 0.6,
        });

        const reply = extractText(result);

        return json({
          success: true,
          reply,
        });
      }

      // =====================================
      // 2. GÉNÉRATION ET MODIFICATION D'IMAGES
      // =====================================

      if (path === "/edit-image") {

        const prompt = typeof body.prompt === "string"
          ? body.prompt.trim()
          : "";

        if (!prompt) {
          return json({
            success: false,
            error: "Décris l'image que tu souhaites créer.",
          }, 400);
        }

        if (prompt.length > 4000) {
          return json({
            success: false,
            error: "La description est trop longue.",
          }, 400);
        }

        const form = new FormData();

        form.set("prompt", prompt);
        form.set("width", "1024");
        form.set("height", "768");

        // Image de référence facultative
        if (body.image) {
          const image = getImageData(body.image);

          form.set(
            "input_image_0",
            new Blob([image.bytes], {
              type: image.mime,
            }),
            "reference-image"
          );
        }

        const formResponse = new Response(form);

        const result = await env.AI.run(MODEL_IMAGE, {
          multipart: {
            body: formResponse.body,
            contentType: formResponse.headers.get("content-type"),
          },
        });

        const generatedImage = extractGeneratedImage(result);

        if (!generatedImage) {
          return json({
            success: false,
            error: "Le modèle n'a pas retourné d'image exploitable.",
          }, 502);
        }

        const imageUrl = generatedImage.startsWith("data:image/")
          ? generatedImage
          : "data:image/png;base64," + generatedImage;

        return json({
          success: true,
          image: imageUrl,
        });
      }

      // =====================================
      // ROUTE INCONNUE
      // =====================================

      return json({
        success: false,
        error: "Route inconnue : " + path,
      }, 404);

    } catch (error) {

      return json({
        success: false,
        error: error?.message || "Erreur interne du serveur.",
      }, 500);

    }
  },
};
