function json(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            "Content-Type": "application/json",
            "X-Content-Type-Options": "nosniff",
            "Cache-Control": "no-store"
        }
    });
}

function securityHeaders(response) {
    const headers = new Headers(response.headers);

    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    headers.set(
        "Content-Security-Policy",
        "default-src 'self'; style-src 'self'; script-src 'self' 'unsafe-inline'"
    );

    return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers
    });
}

export default {
    async fetch(request, env) {
        const url = new URL(request.url);

        // API: GET messages
        if (url.pathname === "/api/messages" && request.method === "GET") {
            const { results } = await env.DB
                .prepare(
                    "SELECT id, name, message, created_at FROM messages ORDER BY id DESC"
                )
                .all();

            return json({
                success: true,
                messages: results
            });
        }

        // API: POST message
        if (url.pathname === "/api/messages" && request.method === "POST") {
            try {
                const contentType = request.headers.get("Content-Type") || "";

                if (!contentType.includes("application/json")) {
                    return json(
                        {
                            success: false,
                            error: "Content-Type must be application/json"
                        },
                        415
                    );
                }

                const body = await request.json();

                const name =
                    typeof body.name === "string"
                        ? body.name.trim()
                        : "";

                const message =
                    typeof body.message === "string"
                        ? body.message.trim()
                        : "";

                if (!name || !message) {
                    return json(
                        {
                            success: false,
                            error: "Name and message are required"
                        },
                        400
                    );
                }

                if (name.length > 100) {
                    return json(
                        {
                            success: false,
                            error: "Name must be 100 characters or fewer"
                        },
                        400
                    );
                }

                if (message.length > 2000) {
                    return json(
                        {
                            success: false,
                            error: "Message must be 2000 characters or fewer"
                        },
                        400
                    );
                }

                const result = await env.DB
                    .prepare(
                        "INSERT INTO messages (name, message) VALUES (?, ?)"
                    )
                    .bind(name, message)
                    .run();

                return json({
                    success: true,
                    id: result.meta.last_row_id
                });

            } catch (error) {
                return json(
                    {
                        success: false,
                        error: "Invalid request"
                    },
                    400
                );
            }
        }

        // Static website
        const response = await env.ASSETS.fetch(request);

        return securityHeaders(response);
    }
};
