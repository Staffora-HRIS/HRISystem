import { describe, it, expect } from "bun:test";
import { Elysia } from "elysia";
import { rateLimitPlugin } from "../../../plugins";

describe("Rate Limit Plugin", () => {
  it("returns 429 after exceeding max requests", async () => {
    let count = 0;

    const cache = {
      incrementRateLimit: async () => {
        count++;
        return { count, exceeded: count > 2 };
      },
    };

    const app = new Elysia()
      .decorate("cache", cache as any)
      .use(rateLimitPlugin({ enabled: true, maxRequests: 2, windowMs: 1000 }))
      .get("/test", () => ({ ok: true }));

    const makeReq = () =>
      app.handle(
        new Request("http://localhost/test", {
          method: "GET",
          headers: {
            "X-Forwarded-For": "203.0.113.10",
          },
        })
      );

    const r1 = await makeReq();
    expect(r1.status).toBe(200);

    const r2 = await makeReq();
    expect(r2.status).toBe(200);

    const r3 = await makeReq();
    expect(r3.status).toBe(429);

    const body = (await r3.json()) as any;
    expect(body?.error?.code).toBe("TOO_MANY_REQUESTS");
  });
});
