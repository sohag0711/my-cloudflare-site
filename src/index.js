function json(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff"
        }
    });
}

function securityHeaders(response) {
    const headers = new Headers(response.headers);

    headers.set("X-Content-Type-Options", "nosniff");

    headers.set(
        "Referrer-Policy",
        "strict-origin-when-cross-origin"
    );

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

        /*
         * Health Check
         *
         * Does not expose the actual secret value.
         */
        if (
            url.pathname === "/api/health" &&
            request.method === "GET"
        ) {
            return json({
                success: true,
                service: "my-cloudflare-site",
                database: !!env.DB,
                rateLimiter: !!env.MESSAGE_RATE_LIMITER,
                assets: !!env.ASSETS,
                secretConfigured: !!env.APP_ENV
            });
        }

        /*
         * GET /api/messages
         *
         * Retrieve messages from D1.
         */
        if (
            url.pathname === "/api/messages" &&
            request.method === "GET"
        ) {
            try {
                const { results } = await env.DB
                    .prepare(
                        `SELECT id, name, message, created_at
                         FROM messages
                         ORDER BY id DESC`
                    )
                    .all();

                return json({
                    success: true,
                    messages: results
                });

            } catch (error) {
                console.error(
                    "Database read error:",
                    error
                );

                return json(
                    {
                        success: false,
                        error: "Unable to retrieve messages"
                    },
                    500
                );
            }
        }

        /*
         * POST /api/messages
         *
         * Insert a message into D1.
         */
        if (
            url.pathname === "/api/messages" &&
            request.method === "POST"
        ) {
            try {
                /*
                 * Rate limiting
                 *
                 * 10 requests / 60 seconds.
                 */
                const rateLimit =
                    await env.MESSAGE_RATE_LIMITER.limit({
                        key: "message-api"
                    });

                if (!rateLimit.success) {
                    return json(
                        {
                            success: false,
                            error:
                                "Rate limit exceeded. Try again later."
                        },
                        429
                    );
                }

                /*
                 * Require JSON requests.
                 */
                const contentType =
                    request.headers.get("Content-Type") || "";

                if (
                    !contentType
                        .toLowerCase()
                        .includes("application/json")
                ) {
                    return json(
                        {
                            success: false,
                            error:
                                "Content-Type must be application/json"
                        },
                        415
                    );
                }

                /*
                 * Parse request body.
                 */
                const body = await request.json();

                const name =
                    typeof body.name === "string"
                        ? body.name.trim()
                        : "";

                const message =
                    typeof body.message === "string"
                        ? body.message.trim()
                        : "";

                /*
                 * Required fields.
                 */
                if (!name || !message) {
                    return json(
                        {
                            success: false,
                            error:
                                "Name and message are required"
                        },
                        400
                    );
                }

                /*
                 * Input length validation.
                 */
                if (name.length > 100) {
                    return json(
                        {
                            success: false,
                            error:
                                "Name must be 100 characters or fewer"
                        },
                        400
                    );
                }

                if (message.length > 2000) {
                    return json(
                        {
                            success: false,
                            error:
                                "Message must be 2000 characters or fewer"
                        },
                        400
                    );
                }

                /*
                 * Parameterized SQL query.
                 *
                 * Prevents SQL injection.
                 */
                const result = await env.DB
                    .prepare(
                        `INSERT INTO messages
                         (name, message)
                         VALUES (?, ?)`
                    )
                    .bind(name, message)
                    .run();

                return json({
                    success: true,
                    id: result.meta.last_row_id
                });

            } catch (error) {
                console.error(
                    "Message API error:",
                    error
                );

                return json(
                    {
                        success: false,
                        error: "Invalid request"
                    },
                    400
                );
            }
        }

        /*
         * Unsupported API endpoints/methods.
         */
        if (url.pathname.startsWith("/api/")) {
            return json(
                {
                    success: false,
                    error: "Method or endpoint not supported"
                },
                405
            );
        }

        /*
         * Static website.
         */
        try {
            const response =
                await env.ASSETS.fetch(request);

            return securityHeaders(response);

        } catch (error) {
            console.error(
                "Static asset error:",
                error
            );

            return new Response(
                "Internal Server Error",
                {
                    status: 500,
                    headers: {
                        "Content-Type": "text/plain",
                        "X-Content-Type-Options":
                            "nosniff"
                    }
                }
            );
        }
    }
};
