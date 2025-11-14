import { describe, expect, it } from "vitest";
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { handler } from "./index";

describe("handler - router", () => {
  it("returns 404 for unknown route", async () => {
    const event: APIGatewayProxyEventV2 = {
      requestContext: {
        http: { method: "GET", path: "/unknown" }
      }
    } as APIGatewayProxyEventV2;

    const response = await handler(event) as APIGatewayProxyResultV2<never>;

    if (typeof response === "string") {
      throw new Error("Expected object response, got string");
    }

    expect(response.statusCode).toBe(404);
  });
});
