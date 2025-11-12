import { describe, it, expect, vi, beforeEach } from "vitest";
import { APIGatewayProxyEvent } from "aws-lambda";
import { handler } from "./getVehicleOverview";
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
    } as unknown as APIGatewayProxyEvent;

    const result = await handler(event);

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body)).toEqual({
      error: "vehicleId is required",
    });
  });

  it("returns 400 when vehicleId format is invalid", async () => {
    const event = {
      pathParameters: { vehicleId: "invalid-id" },
    } as unknown as APIGatewayProxyEvent;

    const result = await handler(event);

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body)).toEqual({
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
    } as unknown as APIGatewayProxyEvent;

    const result = await handler(event);

    expect(result.statusCode).toBe(404);
    expect(JSON.parse(result.body)).toEqual({ error: "Vehicle not found" });
  });

  it("returns vehicle overview successfully", async () => {
    const mockVehicle = {
      _id: "507f1f77bcf86cd799439011",
      vin: "1HGBH41JXMN109186",
      attributes: {
        make: "Honda",
        model: "Accord",
        year: 2021,
      },
      odometer: { current: 45000 },
      acquisition: { date: "2021-03-15" },
      valuation: { estimatedValue: 25000 },
    };

    const mockEvents = [
      {
        _id: "507f1f77bcf86cd799439012",
        type: "oil_change",
        emoji: "🛢️",
        occurredAt: "2024-01-15",
        summary: "Regular oil change",
      },
    ];

    const mockVehiclesCollection = {
      findOne: vi.fn().mockResolvedValue(mockVehicle),
    };

    const mockEventsCollection = {
      countDocuments: vi.fn().mockResolvedValue(5),
      find: vi.fn().mockReturnValue({
        sort: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            toArray: vi.fn().mockResolvedValue(mockEvents),
          }),
        }),
      }),
    };

    const mockDb = {
      collection: vi.fn((name: string) => {
        if (name === "vehicles") return mockVehiclesCollection;
        if (name === "vehicleEvents") return mockEventsCollection;
        return {};
      }),
    };

    vi.mocked(mongodb.getDatabase).mockResolvedValue(mockDb as any);

    const event = {
      pathParameters: { vehicleId: "507f1f77bcf86cd799439011" },
    } as unknown as APIGatewayProxyEvent;

    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body).toEqual({
      vehicleId: "507f1f77bcf86cd799439011",
      vin: "1HGBH41JXMN109186",
      make: "Honda",
      model: "Accord",
      year: 2021,
      odometer: 45000,
      acquisitionDate: "2021-03-15",
      estimatedValue: 25000,
      eventCount: 5,
      recentEvents: [
        {
          _id: "507f1f77bcf86cd799439012",
          type: "oil_change",
          emoji: "🛢️",
          occurredAt: "2024-01-15",
          summary: "Regular oil change",
        },
      ],
      upcomingMaintenance: [],
    });
  });
});
