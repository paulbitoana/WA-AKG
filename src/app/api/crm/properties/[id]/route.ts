import { NextRequest, NextResponse } from "next/server";
import { unlink } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { crmPropertySchema } from "@/lib/crm";
import { crmImagesDir } from "@/lib/crm-paths";

export const dynamic = "force-dynamic";

// PATCH /api/crm/properties/[id] — update property
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
        const existing = await prisma.crmProperty.findFirst({ where: { id, userId: user.id } });
        if (!existing) {
            return NextResponse.json({ status: false, message: "Imobilul nu a fost găsit", error: "Not found" }, { status: 404 });
        }

        const body = await request.json();
        const parsed = crmPropertySchema.safeParse(body);
        if (!parsed.success) {
            const msg = parsed.error.issues[0]?.message || "Date invalide";
            return NextResponse.json({ status: false, message: msg, error: msg }, { status: 400 });
        }

        const property = await prisma.crmProperty.update({
            where: { id },
            data: {
                name: parsed.data.name,
                description: parsed.data.description || null,
                price: parsed.data.price ?? null,
                currency: parsed.data.currency,
                images: parsed.data.images,
            },
        });

        return NextResponse.json({ status: true, message: "Imobil actualizat", data: property });
    } catch (error) {
        console.error("Error updating CRM property:", error);
        return NextResponse.json({ status: false, message: "Internal Server Error", error: "Internal Server Error" }, { status: 500 });
    }
}

// DELETE /api/crm/properties/[id] — delete property and its image files
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
        const existing = await prisma.crmProperty.findFirst({ where: { id, userId: user.id } });
        if (!existing) {
            return NextResponse.json({ status: false, message: "Imobilul nu a fost găsit", error: "Not found" }, { status: 404 });
        }

        await prisma.crmProperty.delete({ where: { id } });

        // Best-effort cleanup of image files
        const images = Array.isArray(existing.images) ? (existing.images as string[]) : [];
        await Promise.all(
            images.map((name) =>
                unlink(path.join(crmImagesDir, name)).catch(() => { /* ignore missing files */ })
            )
        );

        return NextResponse.json({ status: true, message: "Imobil șters" });
    } catch (error) {
        console.error("Error deleting CRM property:", error);
        return NextResponse.json({ status: false, message: "Internal Server Error", error: "Internal Server Error" }, { status: 500 });
    }
}
