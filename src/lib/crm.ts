import { z } from "zod";

/**
 * CRM helpers — phone normalization and message composition
 * for sharing property listings with clients over WhatsApp.
 * Isomorphic: safe to import from client components.
 */

export const CRM_IMAGE_TYPES: Record<string, string> = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
};

export const CRM_IMAGE_MAX_BYTES = 10 * 1024 * 1024; // 10 MB

// Filenames we generate are "<uuid>.<ext>" — anything else is rejected outright
export const CRM_SAFE_FILENAME = /^[A-Za-z0-9-]+\.(jpg|jpeg|png|webp|gif)$/;

export const CRM_IMAGE_MIME: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif",
};

export const DEFAULT_COUNTRY_CODE = "40"; // Romania

/**
 * Normalize a phone number to WhatsApp format:
 * digits only, including country code (e.g. "0740 123 456" → "40740123456",
 * "+49 170 1234567" → "491701234567").
 * Returns null when the number cannot be normalized to a plausible length.
 */
export function normalizePhone(raw: string, defaultCountry = DEFAULT_COUNTRY_CODE): string | null {
    let digits = (raw || "").replace(/\D/g, "");

    if (!digits) return null;

    // Local format without country code: "0740123456" (RO) or "740123456"
    if (digits.startsWith("0")) {
        digits = defaultCountry + digits.replace(/^0+/, "");
    } else if (digits.length <= 9) {
        digits = defaultCountry + digits;
    }

    // WhatsApp JIDs need 8-15 digits including country code
    if (digits.length < 8 || digits.length > 15) return null;

    return digits;
}

/** Build the WhatsApp JID for a normalized phone number. */
export function phoneToJid(phone: string): string {
    return `${phone}@s.whatsapp.net`;
}

export const crmClientSchema = z.object({
    name: z.string().min(1, "Numele este obligatoriu"),
    email: z.string().email("Email invalid").optional().or(z.literal("")),
    phone: z.string().min(6, "Telefon invalid"),
});

export const crmPropertySchema = z.object({
    name: z.string().min(1, "Numele este obligatoriu"),
    description: z.string().optional(),
    price: z.number().positive().optional().nullable(),
    currency: z.string().default("EUR"),
    images: z.array(z.string()).default([]),
});

export const CURRENCIES = ["EUR", "RON", "USD"] as const;

/** Compose the WhatsApp caption/message for a property listing. */
export function composePropertyMessage(property: {
    name: string;
    description?: string | null;
    price?: number | null;
    currency?: string;
}): string {
    const lines: string[] = [`🏠 ${property.name}`];

    if (property.description?.trim()) {
        lines.push(property.description.trim());
    }

    if (property.price != null) {
        const formatted = new Intl.NumberFormat("ro-RO", {
            style: "currency",
            currency: property.currency || "EUR",
            maximumFractionDigits: 0,
        }).format(property.price);
        lines.push(`💰 Preț: ${formatted}`);
    }

    return lines.join("\n");
}
