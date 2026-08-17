export default {
    async fetch(request, env) {
        const url = new URL(request.url);

        if (url.pathname === "/api/hello") {
            return Response.json({
                message: "Hello from Cloudflare Workers!",
                service: "my-cloudflare-site",
                environment: "production"
            });
        }

        return env.ASSETS.fetch(request);
    }
};
