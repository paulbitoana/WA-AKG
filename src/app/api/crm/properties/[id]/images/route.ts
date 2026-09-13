import { NextRequest, NextResponse } from "next/server";
import { writeFile, unlink, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { randomUUID } from "crypto";
import path from "path";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { crmImagesDir } from "@/lib/crm-paths";
import { CRM_IMAGE_TYPES, CRM_IMAGE_MAX_BYTES } from "@/lib/crm";

export const dynamic = "force-dynamic";

// POST /api/crm/properties/[id]/images — upload one or more photos for a property
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const user = await getAuthenticatedUser(request);
        if (!user) {
            return NextResponse.json({ status: false, message: "Unauthorized", error: "Unauthorized" }, { status: 401 });
        }

        const { id } = await params;
        const property = await prisma.crmProperty.findFirst({ where: { id, userId: user.id } });
        if (!property) {
            return NextResponse.json({ status: false, message: "Imobilul nu a fost găsit", error: "Not found" }, { status: 404 });
        }

        const formData = await request.formData();
        const files = formData.getAll("files").filter((f): f is File => f instanceof File);
        if (files.length === 0) {
            return NextResponse.json({ status: false, message: "Nicio poză trimisă", error: "No files" }, { status: 400 });
        }

        if (!existsSync(crmImagesDir)) {
            await mkdir(crmImagesDir, { recursive: true });
        }

        const existingImages = Array.isArray(property.images) ? [...(property.images as string[])] : [];
        const savedNames: string[] = [];

        for (const file of files) {
            const ext = CRM_IMAGE_TYPES[file.type];
            if (!ext) {
                return NextResponse.json({ status: false, message: `Tip de fișier neacceptat: ${file.name} (folosește JPG, PNG, WEBP sau GIF)`, error: "Unsupported type" }, { status: 400 });
            }
            if (file.size > CRM_IMAGE_MAX_BYTES) {
                return NextResponse.json({ status: false, message: `Poza ${file.name} depășește 10 MB`, error: "File too large" }, { status: 400 });
            }

            const fileName = `${randomUUID()}${ext}`;
            const buffer = Buffer.from(await file.arrayBuffer());
            await writeFile(path.join(crmImagesDir, fileName), buffer);
            savedNames.push(fileName);
        }

        const images = [...existingImages, ...savedNames];
        const updated = await prisma.crmProperty.update({
            where: { id },
            data: { images },
        });

        return NextResponse.json({ status: true, message: "Poze încărcate", data: { property: updated, added: savedNames } });
    } catch (error) {
        console.error("Error uploading property images:", error);
        return NextResponse.json({ status: false, message: "Internal Server Error", error: "Internal Server Error" }, { status: 500 });
    }
}

// DELETE /api/crm/properties/[id]/images?name=<filename> — remove one photo
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
        const property = await prisma.crmProperty.findFirst({ where: { id, userId: user.id } });
        if (!property) {
            return NextResponse.json({ status: false, message: "Imobilul nu a fost găsit", error: "Not found" }, { status: 404 });
        }

        const name = new URL(request.url).searchParams.get("name") || "";
        const existingImages = Array.isArray(property.images) ? (property.images as string[]) : [];
        if (!existingImages.includes(name)) {
            return NextResponse.json({ status: false, message: "Poza nu a fost găsită", error: "Not found" }, { status: 404 });
        }

        const images = existingImages.filter((n) => n !== name);
        await prisma.crmProperty.update({ where: { id }, data: { images } });
        await unlink(path.join(crmImagesDir, name)).catch(() => { /* ignore missing files */ });

        return NextResponse.json({ status: true, message: "Poză ștearsă", data: { images } });
    } catch (error) {
        console.error("Error deleting property image:", error);
        return NextResponse.json({ status: false, message: "Internal Server Error", error: "Internal Server Error" }, { status: 500 });
    }
}
