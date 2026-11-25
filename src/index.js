export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/api/hello") {
      return Response.json({ message: "Bonjour depuis Feride AI" });
    }
    return new Response("Introuvable", { status: 404 });
  },
};
