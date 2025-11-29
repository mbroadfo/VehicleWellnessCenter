import { describe, it, expect, vi, beforeEach } from "vitest";
import { APIGatewayProxyEventV2 } from "aws-lambda";
import { handler } from "./routes/getVehicleOverview";
import * as mongodb from "./lib/mongodb";

// Mock the mongodb module
vi.mock("./lib/mongodb");

describe("getVehicleOverview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 when vehicleId is missing", async () => {
    const event = {
      pathParameters: null,
    } as unknown as APIGatewayProxyEventV2;

    const result = await handler(event);

    expect((result as any).statusCode).toBe(400);
    expect(JSON.parse((result as any).body)).toEqual({
      error: "vehicleId is required",
    });
  });

  it("returns 400 when vehicleId format is invalid", async () => {
    const event = {
      pathParameters: { vehicleId: "invalid-id" },
    } as unknown as APIGatewayProxyEventV2;

    const result = await handler(event);

    expect((result as any).statusCode).toBe(400);
    expect(JSON.parse((result as any).body)).toEqual({
      error: "Invalid vehicleId format",
    });
  });

  it("returns 404 when vehicle is not found", async () => {
    const mockDb = {
      collection: vi.fn().mockReturnValue({
        findOne: vi.fn().mockResolvedValue(null),
      }),
    };

    vi.mocked(mongodb.getDatabase).mockResolvedValue(mockDb as any);

    const event = {
      pathParameters: { vehicleId: "507f1f77bcf86cd799439011" },
    } as unknown as APIGatewayProxyEventV2;

    const result = await handler(event);

    expect((result as any).statusCode).toBe(404);
    expect(JSON.parse((result as any).body)).toEqual({ error: "Vehicle not found" });
  });

  it("returns full vehicle document successfully", async () => {
    const mockVehicle = {
      _id: "507f1f77bcf86cd799439011",
      identification: {
        vin: "1HGBH41JXMN109186",
        make: "Honda",
        model: "Accord",
        year: 2021,
      },
      ownership: {
        nickname: "My Honda",
      },
      specs: {
        make: "Honda",
        model: "Accord",
        year: 2021,
        engine: {
          cylinders: 4,
          displacement: 1.5,
        },
        decodedAt: "2024-01-01T00:00:00Z",
      },
      safety: {
        recalls: [],
        complaints: [],
        lastChecked: "2024-01-15T00:00:00Z",
      },
      fuelEconomy: {
        epa: {
          city: 30,
          highway: 38,
          combined: 33,
        },
        lastUpdated: "2024-01-01T00:00:00Z",
      },
      createdAt: "2024-01-01T00:00:00Z",
      lastUpdated: "2024-01-15T00:00:00Z",
    };

    const mockVehiclesCollection = {
      findOne: vi.fn().mockResolvedValue(mockVehicle),
    };

    const mockDb = {
      collection: vi.fn((name: string) => {
        if (name === "vehicles") return mockVehiclesCollection;
        return {};
      }),
    };

    vi.mocked(mongodb.getDatabase).mockResolvedValue(mockDb as any);

    const event = {
      pathParameters: { vehicleId: "507f1f77bcf86cd799439011" },
    } as unknown as APIGatewayProxyEventV2;

    const result = await handler(event);

    expect((result as any).statusCode).toBe(200);
    const body = JSON.parse((result as any).body);
    expect(body).toEqual({
      _id: "507f1f77bcf86cd799439011",
      vin: "1HGBH41JXMN109186",
      name: "My Honda",
      make: "Honda",
      model: "Accord",
      year: 2021,
      specs: {
        make: "Honda",
        model: "Accord",
        year: 2021,
        engine: {
          cylinders: 4,
          displacement: 1.5,
        },
        decodedAt: "2024-01-01T00:00:00Z",
      },
      safety: {
        recalls: [],
        complaints: [],
        lastChecked: "2024-01-15T00:00:00Z",
      },
      fuelEconomy: {
        epa: {
          city: 30,
          highway: 38,
          combined: 33,
        },
        lastUpdated: "2024-01-01T00:00:00Z",
      },
      dealerPortal: undefined,
      createdAt: "2024-01-01T00:00:00Z",
      lastUpdated: "2024-01-15T00:00:00Z",
    });
  });
});
