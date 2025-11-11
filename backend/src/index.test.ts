import { describe, expect, it } from "vitest";

import { handler } from "./index";

describe("handler", () => {
  it("returns the placeholder response", async () => {
    const response = await handler();

    expect(response).toStrictEqual({
      statusCode: 200,
      body: JSON.stringify({ message: "Vehicle Wellness Center backend placeholder" })
    });
  });
});
