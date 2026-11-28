
const MODEL_CHAT = "@cf/google/gemma-4-26b-a4b-it";
const MODEL_IMAGE = "@cf/black-forest-labs/flux-2-klein-4b";

const SYSTEM_PROMPT = `
Tu es FERIDE AI, un assistant intelligent, professionnel et polyvalent.

Tu réponds dans la langue utilisée par l'utilisateur.

TES MISSIONS :
- Répondre aux questions de manière claire et précise.
- Adapter la longueur des réponses à la demande.
- Aider en informatique et programmation.
- Enseigner Windows, Linux, Debian et Ubuntu.
- Expliquer les réseaux et la cybersécurité éthique.
- Aider en bases de données et cloud.
- Expliquer l'intelligence artificielle.
- Aider en électronique et télécommunications.
- Expliquer la maintenance informatique.
- Analyser les images envoyées.
- Aider à apprendre étape par étape.
- Donner des exemples pratiques.

RÈGLES :
- Être professionnel, rapide et pédagogique.
- Ne jamais inventer des informations.
- Ne jamais prétendre avoir effectué une action non réalisée.
- Expliquer les erreurs et proposer des solutions.
`;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

async function readBody(request) {
  try {
    return await request.json();
  } catch {
    throw new Error("Le contenu envoyé n'est pas un JSON valide.");
  }
}

function getImageData(value) {
  if (typeof value !== "string") {
    throw new Error("Image manquante ou invalide.");
  }

  const match = value.match(
    /^data:image\/(jpeg|jpg|png|webp);base64,([A-Za-z0-9+/=\s]+)$/
  );

  if (!match) {
    throw new Error("Format accepté : JPG, PNG ou WEBP.");
  }

  const binary = atob(match[2].replace(/\s/g, ""));

  if (binary.length > 8 * 1024 * 1024) {
    throw new Error("Image trop volumineuse. Maximum : 8 Mo.");
  }

  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return {
    bytes,
    type: match[1] === "jpg" ? "jpeg" : match[1],
  };
}

async function handleChat(request, env) {
  const body = await readBody(request);

  const message = typeof body.message === "string"
    ? body.message.trim()
    : "";

  if (!message && !body.image) {
    return json({
      success: false,
      error: "Écris un message ou envoie une image.",
    }, 400);
  }

  if (message.length > 12000) {
    return json({
      success: false,
      error: "Le message est trop long.",
    }, 400);
  }

  const source = Array.isArray(body.messages)
    ? body.messages
    : Array.isArray(body.history)
      ? body.history
      : [];

  const conversation = source
    .filter(m =>
      m &&
      ["user", "assistant"].includes(m.role) &&
      typeof m.content === "string"
    )
    .slice(-10)
    .map(m => ({
      role: m.role,
      content: m.content.slice(0, 12000),
    }));

  const last = conversation[conversation.length - 1];

  if (
    message &&
    (!last || last.role !== "user" || last.content !== message)
  ) {
    conversation.push({
      role: "user",
      content: message,
    });
  }

  if (body.image) {
    const image = getImageData(body.image);

    const lastMessage = conversation[conversation.length - 1];

    if (!lastMessage || lastMessage.role !== "user") {
      conversation.push({
        role: "user",
        content: message || "Décris cette image.",
      });
    }

    const userMessage = conversation[conversation.length - 1];

    userMessage.content = [
      {
        type: "text",
        text: message || "Analyse et décris cette image.",
      },
      {
        type: "image",
        image: Array.from(image.bytes),
      },
    ];
  }

  const result = await env.AI.run(MODEL_CHAT, {
    messages: [
      {
        role: "system",
        content: SYSTEM_PROMPT,
      },
      ...conversation,
    ],
    chat_template_kwargs: {
      enable_thinking: false,
    },
  });

  const reply =
    result?.response ||
    result?.text ||
    result?.choices?.[0]?.message?.content ||
    "";

  if (typeof reply !== "string" || !reply.trim()) {
    return json({
      success: false,
      error: "Le modèle n'a pas renvoyé de réponse.",
    }, 502);
  }

  return json({
    success: true,
    assistant: "FERIDE AI",
    reply: reply.trim(),
  });
}

async function handleImage(request, env) {
  const body = await readBody(request);

  const prompt = String(body.prompt || body.message || "").trim();

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

  if (body.image) {
    const image = getImageData(body.image);

    form.set(
      "input_image_0",
      new Blob(
        [image.bytes],
        { type: "image/" + image.type }
      ),
      "reference." + image.type
    );
  }

  const formResponse = new Response(form);

  const result = await env.AI.run(MODEL_IMAGE, {
    multipart: {
      body: formResponse.body,
      contentType: formResponse.headers.get("content-type"),
    },
  });

  let base64 = result?.image;

  if (!base64 && result instanceof Response) {
    const data = await result.json();
    base64 = data.image;
  }

  if (base64 instanceof Uint8Array) {
    let binary = "";

    for (let i = 0; i < base64.length; i++) {
      binary += String.fromCharCode(base64[i]);
    }

    base64 = btoa(binary);
  }

  if (typeof base64 !== "string" || !base64) {
    return json({
      success: false,
      error: "Le modèle n'a pas généré d'image.",
    }, 502);
  }

  return json({
    success: true,
    assistant: "FERIDE AI",
    image: "data:image/png;base64," + base64,
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders,
      });
    }

    if (request.method === "GET" && path === "/") {
      return json({
        success: true,
        assistant: "FERIDE AI",
        status: "online",
        message: "Le serveur FERIDE AI fonctionne.",
      });
    }

    if (request.method === "GET" && path === "/health") {
      return json({
        success: true,
        assistant: "FERIDE AI",
        status: "online",
        chat: "ready",
        image: "ready",
      });
    }

    if (request.method === "POST" && path === "/chat") {
      try {
        if (!env.AI) {
          throw new Error("Binding Workers AI manquant.");
        }

        return await handleChat(request, env);
      } catch (error) {
        return json({
          success: false,
          error: error.message || "Erreur du serveur.",
        }, 500);
      }
    }

    if (request.method === "POST" && path === "/edit-image") {
      try {
        if (!env.AI) {
          throw new Error("Binding Workers AI manquant.");
        }

        return await handleImage(request, env);
      } catch (error) {
        return json({
          success: false,
          error: error.message || "Erreur de génération d'image.",
        }, 500);
      }
    }

    return json({
      success: false,
      error: "Route introuvable.",
    }, 404);
  },
};
