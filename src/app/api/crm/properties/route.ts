import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { crmPropertySchema } from "@/lib/crm";

export const dynamic = "force-dynamic";

// GET /api/crm/properties — list properties (with optional search)
export async function GET(request: NextRequest) {
    try {
        const user = await getAuthenticatedUser(request);
        if (!user) {
            return NextResponse.json({ status: false, message: "Unauthorized", error: "Unauthorized" }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const search = searchParams.get("search") || "";

        const where: Prisma.CrmPropertyWhereInput = { userId: user.id };
        if (search) {
            where.OR = [
                { name: { contains: search } },
                { description: { contains: search } },
            ];
        }

        const [properties, total] = await Promise.all([
            prisma.crmProperty.findMany({
                where,
                orderBy: { createdAt: "desc" },
                include: { _count: { select: { sends: true } } },
            }),
            prisma.crmProperty.count({ where }),
        ]);

        return NextResponse.json({
            status: true,
            message: "Properties retrieved successfully",
            data: properties,
            meta: { total },
        });
    } catch (error) {
        console.error("Error fetching CRM properties:", error);
        return NextResponse.json({ status: false, message: "Internal Server Error", error: "Internal Server Error" }, { status: 500 });
    }
}

// POST /api/crm/properties — create property
export async function POST(request: NextRequest) {
    try {
        const user = await getAuthenticatedUser(request);
        if (!user) {
            return NextResponse.json({ status: false, message: "Unauthorized", error: "Unauthorized" }, { status: 401 });
        }

        const body = await request.json();
        const parsed = crmPropertySchema.safeParse(body);
        if (!parsed.success) {
            const msg = parsed.error.issues[0]?.message || "Date invalide";
            return NextResponse.json({ status: false, message: msg, error: msg }, { status: 400 });
        }

        const property = await prisma.crmProperty.create({
            data: {
                userId: user.id,
                name: parsed.data.name,
                description: parsed.data.description || null,
                price: parsed.data.price ?? null,
                currency: parsed.data.currency,
                images: parsed.data.images,
            },
        });

        return NextResponse.json({ status: true, message: "Imobil creat", data: property });
    } catch (error) {
        console.error("Error creating CRM property:", error);
        return NextResponse.json({ status: false, message: "Internal Server Error", error: "Internal Server Error" }, { status: 500 });
    }
}
