import { NextRequest, NextResponse } from "next/server";
import { getAllNumberRouting, setNumberRouting } from "@/lib/phone-directory";

/**
 * GET /api/phone/number-routing
 * Returns routing config for all phone numbers.
 */
export async function GET() {
  try {
    const rows = await getAllNumberRouting();
    const routing = rows.map((r) => ({
      phoneNumber: r.PHONE_NUMBER,
      routeType: r.ROUTE_TYPE,
      forwardToNumber: r.FORWARD_TO_NUMBER,
      forwardToName: r.FORWARD_TO_NAME,
    }));
    return NextResponse.json({ routing });
  } catch (error) {
    console.error("[phone/number-routing] GET error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch routing" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/phone/number-routing
 * Update routing for a specific phone number.
 * Body: { phoneNumber, routeType: "main_menu" | "forward", forwardToNumber?, forwardToName? }
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { phoneNumber, routeType, forwardToNumber, forwardToName } = body;

    if (!phoneNumber || !routeType) {
      return NextResponse.json(
        { error: "phoneNumber and routeType are required" },
        { status: 400 }
      );
    }

    if (routeType !== "main_menu" && routeType !== "forward") {
      return NextResponse.json(
        { error: "routeType must be 'main_menu' or 'forward'" },
        { status: 400 }
      );
    }

    if (routeType === "forward" && !forwardToNumber) {
      return NextResponse.json(
        { error: "forwardToNumber is required when routeType is 'forward'" },
        { status: 400 }
      );
    }

    await setNumberRouting(
      phoneNumber,
      routeType,
      routeType === "forward" ? forwardToNumber : null,
      routeType === "forward" ? (forwardToName || null) : null
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[phone/number-routing] PUT error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update routing" },
      { status: 500 }
    );
  }
}
