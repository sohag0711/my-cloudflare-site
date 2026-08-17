import { describe, it, expect } from "vitest";
import worker from "../src/index.js";

function createEnv() {
    const insertedMessages = [];

    return {
        DB: {
            prepare(query) {
                if (query.includes("SELECT")) {
                    return {
                        all: async () => ({
                            results: insertedMessages
                        })
                    };
                }

                if (query.includes("INSERT")) {
                    return {
                        bind(name, message) {
                            return {
                                run: async () => {
                                    const id =
                                        insertedMessages.length + 1;

                                    insertedMessages.push({
                                        id,
                                        name,
                                        message,
                                        created_at:
                                            "2026-01-01 00:00:00"
                                    });

                                    return {
                                        meta: {
                                            last_row_id: id
                                        }
                                    };
                                }
                            };
                        }
                    };
                }

                throw new Error("Unsupported SQL");
            }
        },

        MESSAGE_RATE_LIMITER: {
            limit: async () => ({
                success: true
            })
        },

        ASSETS: {
            fetch: async () =>
                new Response("Website OK", {
                    status: 200
                })
        },

        APP_ENV: "production"
    };
}

describe("Worker API", () => {
    it("returns a healthy response", async () => {
        const response = await worker.fetch(
            new Request(
                "http://localhost/api/health"
            ),
            createEnv(),
            {}
        );

        expect(response.status).toBe(200);

        const body = await response.json();

        expect(body.success).toBe(true);
        expect(body.service).toBe(
            "my-cloudflare-site"
        );
        expect(body.database).toBe(true);
        expect(body.rateLimiter).toBe(true);
        expect(body.assets).toBe(true);
        expect(body.secretConfigured).toBe(true);
    });

    it("returns messages with GET /api/messages", async () => {
        const env = createEnv();

        const response = await worker.fetch(
            new Request(
                "http://localhost/api/messages"
            ),
            env,
            {}
        );

        expect(response.status).toBe(200);

        const body = await response.json();

        expect(body.success).toBe(true);
        expect(Array.isArray(body.messages)).toBe(
            true
        );
    });

    it("creates a message with POST /api/messages", async () => {
        const env = createEnv();

        const request = new Request(
            "http://localhost/api/messages",
            {
                method: "POST",
                headers: {
                    "Content-Type":
                        "application/json"
                },
                body: JSON.stringify({
                    name: "Test User",
                    message: "Hello from Vitest"
                })
            }
        );

        const response = await worker.fetch(
            request,
            env,
            {}
        );

        expect(response.status).toBe(200);

        const body = await response.json();

        expect(body.success).toBe(true);
        expect(body.id).toBe(1);
    });

    it("rejects missing fields", async () => {
        const env = createEnv();

        const request = new Request(
            "http://localhost/api/messages",
            {
                method: "POST",
                headers: {
                    "Content-Type":
                        "application/json"
                },
                body: JSON.stringify({
                    name: "Test User"
                })
            }
        );

        const response = await worker.fetch(
            request,
            env,
            {}
        );

        expect(response.status).toBe(400);

        const body = await response.json();

        expect(body.success).toBe(false);
    });

    it("rejects non-JSON requests", async () => {
        const env = createEnv();

        const request = new Request(
            "http://localhost/api/messages",
            {
                method: "POST",
                headers: {
                    "Content-Type":
                        "text/plain"
                },
                body: "hello"
            }
        );

        const response = await worker.fetch(
            request,
            env,
            {}
        );

        expect(response.status).toBe(415);

        const body = await response.json();

        expect(body.success).toBe(false);
    });

    it("rejects an oversized name", async () => {
        const env = createEnv();

        const request = new Request(
            "http://localhost/api/messages",
            {
                method: "POST",
                headers: {
                    "Content-Type":
                        "application/json"
                },
                body: JSON.stringify({
                    name: "A".repeat(101),
                    message: "Test"
                })
            }
        );

        const response = await worker.fetch(
            request,
            env,
            {}
        );

        expect(response.status).toBe(400);
    });

    it("rejects an oversized message", async () => {
        const env = createEnv();

        const request = new Request(
            "http://localhost/api/messages",
            {
                method: "POST",
                headers: {
                    "Content-Type":
                        "application/json"
                },
                body: JSON.stringify({
                    name: "Test",
                    message: "A".repeat(2001)
                })
            }
        );

        const response = await worker.fetch(
            request,
            env,
            {}
        );

        expect(response.status).toBe(400);
    });

    it("rejects unsupported API endpoints", async () => {
        const env = createEnv();

        const response = await worker.fetch(
            new Request(
                "http://localhost/api/does-not-exist"
            ),
            env,
            {}
        );

        expect(response.status).toBe(405);

        const body = await response.json();

        expect(body.success).toBe(false);
    });
});
