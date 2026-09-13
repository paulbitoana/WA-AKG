import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { normalizePhone, crmClientSchema } from "@/lib/crm";

export const dynamic = "force-dynamic";

// PATCH /api/crm/clients/[id] — update client
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const user = await getAuthenticatedUser(request);
        if (!user) {
            return NextResponse.json({ status: false, message: "Unauthorized", error: "Unauthorized" }, { status: 401 });
        }

        const { id } = await params;
        const existing = await prisma.crmClient.findFirst({ where: { id, userId: user.id } });
        if (!existing) {
            return NextResponse.json({ status: false, message: "Clientul nu a fost găsit", error: "Not found" }, { status: 404 });
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

        const duplicate = await prisma.crmClient.findFirst({
            where: { userId: user.id, phone, id: { not: id } },
        });
        if (duplicate) {
            return NextResponse.json({ status: false, message: "Există deja un client cu acest număr de telefon", error: "Duplicate phone" }, { status: 409 });
        }

        const client = await prisma.crmClient.update({
            where: { id },
            data: {
                name: parsed.data.name,
                email: parsed.data.email || null,
                phone,
            },
        });

        return NextResponse.json({ status: true, message: "Client actualizat", data: client });
    } catch (error) {
        console.error("Error updating CRM client:", error);
        return NextResponse.json({ status: false, message: "Internal Server Error", error: "Internal Server Error" }, { status: 500 });
    }
}

// DELETE /api/crm/clients/[id] — delete client
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const user = await getAuthenticatedUser(request);
        if (!user) {
            return NextResponse.json({ status: false, message: "Unauthorized", error: "Unauthorized" }, { status: 401 });
        }

        const { id } = await params;
        const existing = await prisma.crmClient.findFirst({ where: { id, userId: user.id } });
        if (!existing) {
            return NextResponse.json({ status: false, message: "Clientul nu a fost găsit", error: "Not found" }, { status: 404 });
        }

        await prisma.crmClient.delete({ where: { id } });

        return NextResponse.json({ status: true, message: "Client șters" });
    } catch (error) {
        console.error("Error deleting CRM client:", error);
        return NextResponse.json({ status: false, message: "Internal Server Error", error: "Internal Server Error" }, { status: 500 });
    }
}
