
const MODEL_CHAT = "@cf/google/gemma-4-26b-a4b-it";
const MODEL_IMAGE = "@cf/black-forest-labs/flux-2-klein-4b";

const SYSTEM_PROMPT = `
Tu es FERIDE AI, un assistant intelligent, professionnel et polyvalent.

Tu réponds en français ou dans la langue utilisée par l'utilisateur.

Tes missions :
- Répondre clairement aux questions.
- Expliquer simplement ou en détail selon la demande.
- Aider en informatique, programmation et réseaux.
- Aider en Linux, Windows, Debian, Ubuntu et cybersécurité éthique.
- Expliquer les bases de données, le cloud et l'intelligence artificielle.
- Aider en électronique, télécommunications et maintenance.
- Analyser les images envoyées.
- Aider à apprendre étape par étape.
- Être honnête sur tes capacités et tes limites.

Ne prétends jamais avoir effectué une action que tu n'as pas réellement effectuée.
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

function getImageData(value) {
  if (typeof value !== "string") {
    throw new Error("Image manquante.");
  }

  const match = value.match(
    /^data:image\/(jpeg|jpg|png|webp);base64,([A-Za-z0-9+/=\s]+)$/
  );

  if (!match) {
    throw new Error("Format d'image non valide.");
  }

  const binary = atob(match[2].replace(/\s/g, ""));
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
  const body = await request.json();

  const messages = Array.isArray(body.messages)
    ? body.messages
    : Array.isArray(body.history)
      ? body.history
      : [];

  const conversation = messages
    .filter(m =>
      m &&
      ["user", "assistant"].includes(m.role) &&
      typeof m.content === "string"
    )
    .slice(-12)
    .map(m => ({
      role: m.role,
      content: m.content.slice(0, 12000),
    }));

  const message = typeof body.message === "string"
    ? body.message.trim()
    : "";

  if (!message && !body.image) {
    return json({ success: false, error: "Écris un message." }, 400);
  }

  const lastMessage = conversation[conversation.length - 1];

  if (message && (!lastMessage || lastMessage.role !== "user" ||
      lastMessage.content !== message)) {
    conversation.push({ role: "user", content: message });
  }

  const userMessage = conversation[conversation.length - 1];

  if (body.image) {
    const image = getImageData(body.image);

    userMessage.content = [
      { type: "text", text: message || "Décris cette image." },
      {
        type: "image",
        image: Array.from(image.bytes),
      },
    ];
  }

  const result = await env.AI.run(MODEL_CHAT, {
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
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

  if (!reply) {
    return json({
      success: false,
      error: "Le modèle n'a pas renvoyé de réponse.",
      details: result,
    }, 502);
  }

  return json({
    success: true,
    reply,
  });
}

async function handleImage(request, env) {
  const body = await request.json();

  const prompt = String(body.prompt || body.message || "").trim();

  if (!prompt) {
    return json({
      success: false,
      error: "Décris l'image que tu souhaites créer ou modifier.",
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

  if (!base64) {
    return json({
      success: false,
      error: "Le modèle n'a pas généré d'image.",
    }, 502);
  }

  return json({
    success: true,
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

