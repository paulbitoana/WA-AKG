import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser, canAccessSession } from "@/lib/api-auth";
import { ChatService } from "@/modules/whatsapp/chat.service";
import { waManager } from "@/modules/whatsapp/manager";
import {
    composePropertyMessage,
    phoneToJid,
    CRM_SAFE_FILENAME,
    CRM_IMAGE_MIME,
} from "@/lib/crm";
import { crmImagesDir } from "@/lib/crm-paths";

export const dynamic = "force-dynamic";

const sendSchema = z.object({
    propertyId: z.string().min(1),
    clientIds: z.array(z.string().min(1)).min(1, "Selectează cel puțin un client"),
    sessionId: z.string().min(1, "Selectează o sesiune WhatsApp"),
    message: z.string().optional(),
});

const SEND_DELAY_MS = 2000; // anti-ban delay between clients

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * POST /api/crm/send — send a property listing to one or more clients
 * over the connected WhatsApp session. First photo carries the caption;
 * extra photos are sent as follow-up images.
 */
export async function POST(request: NextRequest) {
    try {
        const user = await getAuthenticatedUser(request);
        if (!user) {
            return NextResponse.json({ status: false, message: "Unauthorized", error: "Unauthorized" }, { status: 401 });
        }

        const body = await request.json();
        const parsed = sendSchema.safeParse(body);
        if (!parsed.success) {
            const msg = parsed.error.issues[0]?.message || "Date invalide";
            return NextResponse.json({ status: false, message: msg, error: msg }, { status: 400 });
        }

        const { propertyId, clientIds, sessionId, message } = parsed.data;

        // Session must belong to (or be shared with) the user and be connected
        const canAccess = await canAccessSession(user.id, user.role, sessionId);
        if (!canAccess) {
            return NextResponse.json({ status: false, message: "Nu ai acces la această sesiune", error: "Forbidden" }, { status: 403 });
        }

        const session = await prisma.session.findUnique({ where: { sessionId } });
        if (!session || session.status !== "CONNECTED") {
            return NextResponse.json({ status: false, message: "Sesiunea WhatsApp nu este conectată. Conecteaz-o din pagina Sessions / QR.", error: "Session not connected" }, { status: 400 });
        }

        const instance = waManager.getInstance(sessionId);
        if (!instance || !instance.socket) {
            return NextResponse.json({ status: false, message: "Sesiunea WhatsApp nu este conectată", error: "Session not connected" }, { status: 400 });
        }

        const property = await prisma.crmProperty.findFirst({ where: { id: propertyId, userId: user.id } });
        if (!property) {
            return NextResponse.json({ status: false, message: "Imobilul nu a fost găsit", error: "Not found" }, { status: 404 });
        }

        const clients = await prisma.crmClient.findMany({
            where: { id: { in: clientIds }, userId: user.id },
        });
        if (clients.length === 0) {
            return NextResponse.json({ status: false, message: "Niciun client valid selectat", error: "No clients" }, { status: 400 });
        }

        const text = message?.trim() || composePropertyMessage(property);
        const imageNames = (Array.isArray(property.images) ? (property.images as string[]) : [])
            .filter((name) => CRM_SAFE_FILENAME.test(name));

        // Pre-load image buffers once, reused for every client
        const root = path.resolve(crmImagesDir);
        const imageBuffers: { buffer: Buffer; mimetype: string; fileName: string }[] = [];
        for (const name of imageNames) {
            const target = path.resolve(root, name);
            if (target !== root && !target.startsWith(root + path.sep)) continue;
            try {
                const buffer = await readFile(target);
                const ext = path.extname(name).toLowerCase();
                imageBuffers.push({ buffer, mimetype: CRM_IMAGE_MIME[ext] || "image/jpeg", fileName: name });
            } catch {
                // Skip missing/corrupt files rather than failing the whole send
            }
        }

        const results: { clientId: string; clientName: string; status: string; error?: string }[] = [];

        for (let i = 0; i < clients.length; i++) {
            const client = clients[i];
            const jid = phoneToJid(client.phone);

            try {
                if (imageBuffers.length > 0) {
                    // First photo carries the listing text as caption
                    await ChatService.sendMediaMessage(
                        sessionId, jid,
                        imageBuffers[0].buffer, "image",
                        imageBuffers[0].mimetype, imageBuffers[0].fileName,
                        text
                    );
                    for (const img of imageBuffers.slice(1)) {
                        await sleep(500); // small pause between photos of the same listing
                        await ChatService.sendMediaMessage(
                            sessionId, jid,
                            img.buffer, "image",
                            img.mimetype, img.fileName,
                            ""
                        );
                    }
                } else {
                    await ChatService.sendTextMessage(sessionId, jid, text);
                }

                await prisma.propertySend.create({
                    data: {
                        clientId: client.id,
                        propertyId: property.id,
                        sessionId,
                        status: "SENT",
                    },
                });
                results.push({ clientId: client.id, clientName: client.name, status: "SENT" });
            } catch (err) {
                const errorMessage = err instanceof Error ? err.message : "Trimitere eșuată";
                await prisma.propertySend.create({
                    data: {
                        clientId: client.id,
                        propertyId: property.id,
                        sessionId,
                        status: "FAILED",
                        error: errorMessage,
                    },
                });
                results.push({ clientId: client.id, clientName: client.name, status: "FAILED", error: errorMessage });
            }

            // Anti-ban delay between clients (skip after the last one)
            if (i < clients.length - 1) {
                await sleep(SEND_DELAY_MS);
            }
        }

        const sentCount = results.filter((r) => r.status === "SENT").length;
        return NextResponse.json({
            status: true,
            message: `Trimis ${sentCount}/${results.length} clienți`,
            data: { results, sent: sentCount, total: results.length },
        });
    } catch (error) {
        console.error("Error sending property:", error);
        return NextResponse.json({ status: false, message: "Internal Server Error", error: "Internal Server Error" }, { status: 500 });
    }
}
