import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser, canAccessSession } from "@/lib/api-auth";
import { phoneToJid } from "@/lib/crm";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/clients/[id]/conversation?sessionId=<wa-session-id>
 * Returns the full timeline with a client: WhatsApp messages (sent + replies)
 * and property listings shared through the CRM.
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const user = await getAuthenticatedUser(request);
        if (!user) {
            return NextResponse.json({ status: false, message: "Unauthorized", error: "Unauthorized" }, { status: 401 });
        }

        const { id } = await params;
        const client = await prisma.crmClient.findFirst({ where: { id, userId: user.id } });
        if (!client) {
            return NextResponse.json({ status: false, message: "Clientul nu a fost găsit", error: "Not found" }, { status: 404 });
        }

        const sessionId = new URL(request.url).searchParams.get("sessionId") || "";
        if (!sessionId) {
            return NextResponse.json({ status: false, message: "sessionId este obligatoriu", error: "sessionId required" }, { status: 400 });
        }

        const canAccess = await canAccessSession(user.id, user.role, sessionId);
        if (!canAccess) {
            return NextResponse.json({ status: false, message: "Nu ai acces la această sesiune", error: "Forbidden" }, { status: 403 });
        }

        const session = await prisma.session.findUnique({ where: { sessionId }, select: { id: true } });
        if (!session) {
            return NextResponse.json({ status: false, message: "Sesiunea nu a fost găsită", error: "Not found" }, { status: 404 });
        }

        const phoneJid = phoneToJid(client.phone);

        // Some chats may be addressed by WhatsApp LID instead of the phone JID
        const contact = await prisma.contact.findFirst({
            where: { sessionId: session.id, jid: phoneJid },
            select: { lid: true },
        });
        const jids = contact?.lid ? [phoneJid, contact.lid] : [phoneJid];

        // Latest 200 messages, oldest first
        const messages = await prisma.message.findMany({
            where: {
                sessionId: session.id,
                remoteJid: { in: jids },
            },
            orderBy: { timestamp: "desc" },
            take: 200,
            select: {
                id: true,
                fromMe: true,
                type: true,
                content: true,
                mediaUrl: true,
                status: true,
                timestamp: true,
            },
        });
        messages.reverse();

        const sends = await prisma.propertySend.findMany({
            where: { clientId: client.id, sessionId },
            orderBy: { sentAt: "desc" },
            take: 50,
            select: {
                id: true,
                status: true,
                error: true,
                sentAt: true,
                property: { select: { id: true, name: true } },
            },
        });

        // Merge into a single chronological timeline
        const timeOf = (item: { timestamp?: Date; sentAt?: Date }) =>
            new Date(item.timestamp ?? item.sentAt ?? 0).getTime();
        const timeline = [
            ...messages.map((m) => ({ kind: "message" as const, ...m })),
            ...sends.map((s) => ({ kind: "send" as const, ...s })),
        ].sort((a, b) => timeOf(a) - timeOf(b));

        return NextResponse.json({
            status: true,
            message: "Conversation retrieved successfully",
            data: { client: { id: client.id, name: client.name, phone: client.phone }, timeline },
        });
    } catch (error) {
        console.error("Error fetching CRM conversation:", error);
        return NextResponse.json({ status: false, message: "Internal Server Error", error: "Internal Server Error" }, { status: 500 });
    }
}
