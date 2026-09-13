import path from "path";

// Private storage for property images, NOT in public/ (server only)
export const crmImagesDir = path.join(process.cwd(), "data", "media", "crm");
