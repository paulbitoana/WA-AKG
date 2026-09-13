import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { existsSync } from "fs";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { crmImagesDir } from "@/lib/crm-paths";

const CONTENT_TYPES: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif",
};

// Filenames we generate are "<uuid>.<ext>" — anything else is rejected outright
const SAFE_FILENAME = /^[A-Za-z0-9-]+\.(jpg|jpeg|png|webp|gif)$/;

// GET /api/crm/images/[filename] — serve a property image (auth-protected)
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ filename: string }> }
) {
    try {
        const user = await getAuthenticatedUser(request);
        if (!user) {
            return NextResponse.json({ status: false, message: "Unauthorized", error: "Unauthorized" }, { status: 401 });
        }

        const { filename } = await params;

        // Security: only allow generated names — blocks traversal, separators and encoded sequences
        if (!SAFE_FILENAME.test(filename)) {
            return NextResponse.json({ status: false, message: "Invalid filename", error: "Invalid filename" }, { status: 400 });
        }

        const root = path.resolve(crmImagesDir);
        const target = path.resolve(root, filename);
        if (target !== root && !target.startsWith(root + path.sep)) {
            return NextResponse.json({ status: false, message: "Access denied", error: "Access denied" }, { status: 403 });
        }

        if (!existsSync(target)) {
            return NextResponse.json({ status: false, message: "File not found", error: "File not found" }, { status: 404 });
        }

        const buffer = await readFile(target);
        const contentType = CONTENT_TYPES[path.extname(target).toLowerCase()] || "application/octet-stream";

        return new NextResponse(buffer, {
            headers: {
                "Content-Type": contentType,
                "Cache-Control": "private, max-age=3600",
            },
        });
    } catch (error) {
        console.error("Error serving CRM image:", error);
        return NextResponse.json({ status: false, message: "Internal Server Error", error: "Internal Server Error" }, { status: 500 });
    }
}
