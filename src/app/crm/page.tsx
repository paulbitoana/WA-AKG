import type { Metadata } from "next";
import { CrmApp } from "@/components/crm/crm-app";

export const metadata: Metadata = {
    title: "CRM Imobile",
    description: "Trimite imobile clienților pe WhatsApp și urmărește răspunsurile.",
};

export default function CrmPage() {
    return <CrmApp />;
}
