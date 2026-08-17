export default {
    async fetch(request, env) {
        const url = new URL(request.url);

        // GET /api/messages
        if (url.pathname === "/api/messages" && request.method === "GET") {
            const { results } = await env.DB
                .prepare(
                    "SELECT id, name, message, created_at FROM messages ORDER BY id DESC"
                )
                .all();

            return Response.json({
                success: true,
                messages: results
            });
        }

        // POST /api/messages
        if (url.pathname === "/api/messages" && request.method === "POST") {
            try {
                const body = await request.json();

                if (!body.name || !body.message) {
                    return Response.json(
                        {
                            success: false,
                            error: "name and message are required"
                        },
                        { status: 400 }
                    );
                }

                const result = await env.DB
                    .prepare(
                        "INSERT INTO messages (name, message) VALUES (?, ?)"
                    )
                    .bind(body.name, body.message)
                    .run();

                return Response.json({
                    success: true,
                    id: result.meta.last_row_id
                });
            } catch (error) {
                return Response.json(
                    {
                        success: false,
                        error: "Invalid request"
                    },
                    { status: 400 }
                );
            }
        }

        // Static website
        return env.ASSETS.fetch(request);
    }
};
