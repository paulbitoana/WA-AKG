import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { normalizePhone, crmClientSchema } from "@/lib/crm";

export const dynamic = "force-dynamic";

// GET /api/crm/clients — list clients (with optional search)
export async function GET(request: NextRequest) {
    try {
        const user = await getAuthenticatedUser(request);
        if (!user) {
            return NextResponse.json({ status: false, message: "Unauthorized", error: "Unauthorized" }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const search = searchParams.get("search") || "";

        const where: Prisma.CrmClientWhereInput = { userId: user.id };
        if (search) {
            where.OR = [
                { name: { contains: search } },
                { email: { contains: search } },
                { phone: { contains: search } },
            ];
        }

        const [clients, total] = await Promise.all([
            prisma.crmClient.findMany({
                where,
                orderBy: { name: "asc" },
                include: { _count: { select: { sends: true } } },
            }),
            prisma.crmClient.count({ where }),
        ]);

        return NextResponse.json({
            status: true,
            message: "Clients retrieved successfully",
            data: clients,
            meta: { total },
        });
    } catch (error) {
        console.error("Error fetching CRM clients:", error);
        return NextResponse.json({ status: false, message: "Internal Server Error", error: "Internal Server Error" }, { status: 500 });
    }
}

// POST /api/crm/clients — create client
export async function POST(request: NextRequest) {
    try {
        const user = await getAuthenticatedUser(request);
        if (!user) {
            return NextResponse.json({ status: false, message: "Unauthorized", error: "Unauthorized" }, { status: 401 });
        }

        const body = await request.json();
        const parsed = crmClientSchema.safeParse(body);
        if (!parsed.success) {
            const msg = parsed.error.issues[0]?.message || "Date invalide";
            return NextResponse.json({ status: false, message: msg, error: msg }, { status: 400 });
        }

        const phone = normalizePhone(parsed.data.phone);
        if (!phone) {
            return NextResponse.json({ status: false, message: "Număr de telefon invalid", error: "Număr de telefon invalid" }, { status: 400 });
        }

        const existing = await prisma.crmClient.findFirst({
            where: { userId: user.id, phone },
        });
        if (existing) {
            return NextResponse.json({ status: false, message: "Există deja un client cu acest număr de telefon", error: "Duplicate phone" }, { status: 409 });
        }

        const client = await prisma.crmClient.create({
            data: {
                userId: user.id,
                name: parsed.data.name,
                email: parsed.data.email || null,
                phone,
            },
        });

        return NextResponse.json({ status: true, message: "Client creat", data: client });
    } catch (error) {
        console.error("Error creating CRM client:", error);
        return NextResponse.json({ status: false, message: "Internal Server Error", error: "Internal Server Error" }, { status: 500 });
    }
}
