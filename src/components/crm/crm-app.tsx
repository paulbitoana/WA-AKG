"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { signOut } from "next-auth/react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
} from "@/components/ui/sheet";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import {
    Search,
    Loader2,
    Plus,
    Pencil,
    Trash2,
    Send,
    MessageSquare,
    Building2,
    Users,
    X,
    RefreshCw,
    ImagePlus,
    QrCode,
    LogOut,
} from "lucide-react";
import { composePropertyMessage, CURRENCIES } from "@/lib/crm";

type ClientRow = {
    id: string;
    name: string;
    email?: string | null;
    phone: string;
    _count?: { sends: number };
};

type PropertyRow = {
    id: string;
    name: string;
    description?: string | null;
    price?: number | null;
    currency: string;
    images: unknown;
    createdAt: string;
    _count?: { sends: number };
};

type SessionRow = {
    sessionId: string;
    name: string;
    status: string;
};

type TimelineItem = {
    kind: "message" | "send";
    id: string;
    fromMe?: boolean;
    type?: string;
    content?: string | null;
    mediaUrl?: string | null;
    timestamp?: string;
    sentAt?: string;
    status?: string;
    error?: string | null;
    property?: { id: string; name: string } | null;
};

const propertyImages = (p: PropertyRow): string[] =>
    Array.isArray(p.images) ? (p.images as string[]) : [];

const formatPhone = (phone: string) => (phone.startsWith("+") ? phone : `+${phone}`);

const formatPrice = (price: number | null | undefined, currency: string) => {
    if (price == null) return "—";
    return new Intl.NumberFormat("ro-RO", {
        style: "currency",
        currency,
        maximumFractionDigits: 0,
    }).format(price);
};

const formatTime = (iso?: string) =>
    iso
        ? new Date(iso).toLocaleString("ro-RO", {
              day: "2-digit",
              month: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
          })
        : "";

export function CrmApp() {
    // Data
    const [clients, setClients] = useState<ClientRow[]>([]);
    const [properties, setProperties] = useState<PropertyRow[]>([]);
    const [sessions, setSessions] = useState<SessionRow[]>([]);
    const [loading, setLoading] = useState(true);

    const connectedSessions = sessions.filter((s) => s.status === "CONNECTED");

    // Local search filters
    const [propertySearch, setPropertySearch] = useState("");
    const [clientSearch, setClientSearch] = useState("");

    // Client dialog
    const [clientDialogOpen, setClientDialogOpen] = useState(false);
    const [editingClient, setEditingClient] = useState<ClientRow | null>(null);
    const [clientForm, setClientForm] = useState({ name: "", email: "", phone: "" });
    const [savingClient, setSavingClient] = useState(false);

    // Property dialog
    const [propertyDialogOpen, setPropertyDialogOpen] = useState(false);
    const [editingProperty, setEditingProperty] = useState<PropertyRow | null>(null);
    const [propertyForm, setPropertyForm] = useState({ name: "", description: "", price: "", currency: "EUR" });
    const [newImages, setNewImages] = useState<File[]>([]);
    const [savingProperty, setSavingProperty] = useState(false);

    // Send dialog
    const [sendDialogOpen, setSendDialogOpen] = useState(false);
    const [sendProperty, setSendProperty] = useState<PropertyRow | null>(null);
    const [sendClientIds, setSendClientIds] = useState<Set<string>>(new Set());
    const [sendSessionId, setSendSessionId] = useState("");
    const [sendMessage, setSendMessage] = useState("");
    const [sending, setSending] = useState(false);

    // Conversation sheet
    const [convClient, setConvClient] = useState<ClientRow | null>(null);
    const [convSessionId, setConvSessionId] = useState("");
    const [timeline, setTimeline] = useState<TimelineItem[]>([]);
    const [convLoading, setConvLoading] = useState(false);
    const convBottomRef = useRef<HTMLDivElement>(null);

    // WhatsApp connect dialog
    const [connectOpen, setConnectOpen] = useState(false);
    const [qrTarget, setQrTarget] = useState<string | null>(null);
    const [qrBase64, setQrBase64] = useState<string | null>(null);
    const [creatingSession, setCreatingSession] = useState(false);

    const loadAll = useCallback(async () => {
        setLoading(true);
        try {
            const [clientsRes, propertiesRes, sessionsRes] = await Promise.all([
                fetch("/api/crm/clients"),
                fetch("/api/crm/properties"),
                fetch("/api/sessions"),
            ]);
            const clientsData = await clientsRes.json();
            const propertiesData = await propertiesRes.json();
            const sessionsData = await sessionsRes.json();
            if (clientsData.status) setClients(clientsData.data || []);
            if (propertiesData.status) setProperties(propertiesData.data || []);
            if (sessionsData.status) setSessions(sessionsData.data || []);
        } catch {
            toast.error("Nu am putut încărca datele");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadAll();
    }, [loadAll]);

    // While the connect dialog is open: refresh session statuses…
    useEffect(() => {
        if (!connectOpen) return;
        const interval = setInterval(async () => {
            try {
                const res = await fetch("/api/sessions");
                const data = await res.json();
                if (data.status) {
                    setSessions(data.data || []);
                    const target = (data.data || []).find((s: SessionRow) => s.sessionId === qrTarget);
                    if (target && target.status === "CONNECTED") {
                        toast.success("WhatsApp conectat!");
                        setQrTarget(null);
                        setQrBase64(null);
                    }
                }
            } catch { /* keep polling */ }
        }, 3000);
        return () => clearInterval(interval);
    }, [connectOpen, qrTarget]);

    // …and keep fetching the QR for the selected session until it connects
    useEffect(() => {
        if (!connectOpen || !qrTarget) return;
        let cancelled = false;

        const fetchQr = async () => {
            try {
                const res = await fetch(`/api/sessions/${encodeURIComponent(qrTarget)}/qr`);
                if (res.status === 400) {
                    // "Already connected"
                    toast.success("WhatsApp conectat!");
                    setQrTarget(null);
                    setQrBase64(null);
                    return;
                }
                const data = await res.json();
                if (!cancelled && data.base64) setQrBase64(data.base64);
            } catch { /* retry on next tick */ }
        };

        fetchQr();
        const interval = setInterval(fetchQr, 2500);
        return () => {
            cancelled = true;
            clearInterval(interval);
        };
    }, [connectOpen, qrTarget]);

    // ---------- WhatsApp session ----------

    const createSession = async () => {
        setCreatingSession(true);
        try {
            const name = `WhatsApp ${new Date().toLocaleDateString("ro-RO")}`;
            const res = await fetch("/api/sessions", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name }),
            });
            const data = await res.json();
            if (!data.status) {
                toast.error(data.message || "Nu am putut crea sesiunea");
                return;
            }
            toast.success("Sesiune creată — așteaptă codul QR");
            const sessionsRes = await fetch("/api/sessions");
            const sessionsData = await sessionsRes.json();
            if (sessionsData.status) setSessions(sessionsData.data || []);
            setQrBase64(null);
            setQrTarget(data.data.sessionId);
        } catch {
            toast.error("Nu am putut crea sesiunea");
        } finally {
            setCreatingSession(false);
        }
    };

    // ---------- Clients ----------

    const openClientDialog = (client?: ClientRow) => {
        setEditingClient(client || null);
        setClientForm({
            name: client?.name || "",
            email: client?.email || "",
            phone: client ? formatPhone(client.phone) : "",
        });
        setClientDialogOpen(true);
    };

    const saveClient = async () => {
        setSavingClient(true);
        try {
            const payload = {
                name: clientForm.name,
                email: clientForm.email || "",
                phone: clientForm.phone,
            };
            const res = await fetch(
                editingClient ? `/api/crm/clients/${editingClient.id}` : "/api/crm/clients",
                {
                    method: editingClient ? "PATCH" : "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                }
            );
            const data = await res.json();
            if (!data.status) {
                toast.error(data.message || "Eroare la salvare");
                return;
            }
            toast.success(editingClient ? "Client actualizat" : "Client adăugat");
            setClientDialogOpen(false);
            loadAll();
        } catch {
            toast.error("Eroare la salvare");
        } finally {
            setSavingClient(false);
        }
    };

    const deleteClient = async (client: ClientRow) => {
        if (!confirm(`Ștergi clientul "${client.name}"? Istoricul trimiterilor către el va fi pierdut.`)) return;
        const res = await fetch(`/api/crm/clients/${client.id}`, { method: "DELETE" });
        const data = await res.json();
        if (data.status) {
            toast.success("Client șters");
            loadAll();
        } else {
            toast.error(data.message || "Eroare la ștergere");
        }
    };

    // ---------- Properties ----------

    const openPropertyDialog = (property?: PropertyRow) => {
        setEditingProperty(property || null);
        setPropertyForm({
            name: property?.name || "",
            description: property?.description || "",
            price: property?.price != null ? String(property.price) : "",
            currency: property?.currency || "EUR",
        });
        setNewImages([]);
        setPropertyDialogOpen(true);
    };

    const saveProperty = async () => {
        if (!propertyForm.name.trim()) {
            toast.error("Numele imobilului este obligatoriu");
            return;
        }
        setSavingProperty(true);
        try {
            const payload = {
                name: propertyForm.name,
                description: propertyForm.description,
                price: propertyForm.price ? Number(propertyForm.price) : null,
                currency: propertyForm.currency,
                images: editingProperty ? propertyImages(editingProperty) : [],
            };
            const res = await fetch(
                editingProperty ? `/api/crm/properties/${editingProperty.id}` : "/api/crm/properties",
                {
                    method: editingProperty ? "PATCH" : "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                }
            );
            const data = await res.json();
            if (!data.status) {
                toast.error(data.message || "Eroare la salvare");
                return;
            }

            // Upload newly chosen photos
            if (newImages.length > 0) {
                const formData = new FormData();
                newImages.forEach((file) => formData.append("files", file));
                const uploadRes = await fetch(`/api/crm/properties/${data.data.id}/images`, {
                    method: "POST",
                    body: formData,
                });
                const uploadData = await uploadRes.json();
                if (!uploadData.status) {
                    toast.error(uploadData.message || "Pozele nu au putut fi încărcate");
                }
            }

            toast.success(editingProperty ? "Imobil actualizat" : "Imobil adăugat");
            setPropertyDialogOpen(false);
            loadAll();
        } catch {
            toast.error("Eroare la salvare");
        } finally {
            setSavingProperty(false);
        }
    };

    const deleteProperty = async (property: PropertyRow) => {
        if (!confirm(`Ștergi imobilul "${property.name}"? Pozele asociate vor fi șterse.`)) return;
        const res = await fetch(`/api/crm/properties/${property.id}`, { method: "DELETE" });
        const data = await res.json();
        if (data.status) {
            toast.success("Imobil șters");
            loadAll();
        } else {
            toast.error(data.message || "Eroare la ștergere");
        }
    };

    // ---------- Send ----------

    const openSendDialog = (property: PropertyRow) => {
        if (connectedSessions.length === 0) {
            toast.error("Nicio sesiune WhatsApp conectată. Apasă „Conectează WhatsApp” ca să scanezi codul QR.");
            setConnectOpen(true);
            return;
        }
        if (clients.length === 0) {
            toast.error("Adaugă întâi cel puțin un client.");
            return;
        }
        setSendProperty(property);
        setSendClientIds(new Set());
        setSendSessionId(connectedSessions[0].sessionId);
        setSendMessage(composePropertyMessage(property));
        setSendDialogOpen(true);
    };

    const toggleSendClient = (id: string) => {
        setSendClientIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const doSend = async () => {
        if (!sendProperty) return;
        if (sendClientIds.size === 0) {
            toast.error("Selectează cel puțin un client");
            return;
        }
        setSending(true);
        try {
            const res = await fetch("/api/crm/send", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    propertyId: sendProperty.id,
                    clientIds: Array.from(sendClientIds),
                    sessionId: sendSessionId,
                    message: sendMessage,
                }),
            });
            const data = await res.json();
            if (!data.status) {
                toast.error(data.message || "Trimiterea a eșuat");
                return;
            }
            const failed = data.data.results.filter((r: { status: string }) => r.status === "FAILED");
            if (failed.length === 0) {
                toast.success(`Imobilul a fost trimis la ${data.data.sent} clienți`);
            } else {
                toast.warning(`Trimis ${data.data.sent}/${data.data.total}. Eșuate: ${failed.map((f: { clientName: string }) => f.clientName).join(", ")}`);
            }
            setSendDialogOpen(false);
            loadAll();
        } catch {
            toast.error("Trimiterea a eșuat");
        } finally {
            setSending(false);
        }
    };

    // ---------- Conversation ----------

    const loadConversation = useCallback(
        async (client: ClientRow, sessionId: string, silent = false) => {
            if (!client || !sessionId) return;
            if (!silent) setConvLoading(true);
            try {
                const res = await fetch(`/api/crm/clients/${client.id}/conversation?sessionId=${encodeURIComponent(sessionId)}`);
                const data = await res.json();
                if (data.status) {
                    setTimeline(data.data.timeline || []);
                } else if (!silent) {
                    toast.error(data.message || "Nu am putut încărca conversația");
                }
            } catch {
                if (!silent) toast.error("Nu am putut încărca conversația");
            } finally {
                if (!silent) setConvLoading(false);
            }
        },
        []
    );

    const openConversation = (client: ClientRow) => {
        const sessionId =
            convSessionId && sessions.some((s) => s.sessionId === convSessionId && s.status === "CONNECTED")
                ? convSessionId
                : connectedSessions[0]?.sessionId || "";
        if (!sessionId) {
            toast.error("Nicio sesiune WhatsApp conectată. Conversația are nevoie de o sesiune activă.");
            return;
        }
        setConvClient(client);
        setConvSessionId(sessionId);
        setTimeline([]);
        loadConversation(client, sessionId);
    };

    // Poll for replies while the sheet is open
    useEffect(() => {
        if (!convClient) return;
        const interval = setInterval(() => {
            loadConversation(convClient, convSessionId, true);
        }, 10000);
        return () => clearInterval(interval);
    }, [convClient, convSessionId, loadConversation]);

    useEffect(() => {
        convBottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [timeline]);

    // ---------- Render helpers ----------

    const renderClientRows = () =>
        clients
            .filter((c) => {
                const q = clientSearch.toLowerCase();
                return !q || c.name.toLowerCase().includes(q) || (c.email || "").toLowerCase().includes(q) || c.phone.includes(q);
            })
            .map((client) => (
                <TableRow key={client.id}>
                    <TableCell className="font-medium">{client.name}</TableCell>
                    <TableCell>{client.email || "—"}</TableCell>
                    <TableCell>{formatPhone(client.phone)}</TableCell>
                    <TableCell>{client._count?.sends ?? 0}</TableCell>
                    <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                            <Button
                                variant="ghost"
                                size="icon"
                                title="Conversație"
                                onClick={() => openConversation(client)}
                                disabled={connectedSessions.length === 0}
                            >
                                <MessageSquare className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" title="Editează" onClick={() => openClientDialog(client)}>
                                <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" title="Șterge" onClick={() => deleteClient(client)}>
                                <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                        </div>
                    </TableCell>
                </TableRow>
            ));

    const renderPropertyRows = () =>
        properties
            .filter((p) => {
                const q = propertySearch.toLowerCase();
                return !q || p.name.toLowerCase().includes(q) || (p.description || "").toLowerCase().includes(q);
            })
            .map((property) => {
                const images = propertyImages(property);
                return (
                    <TableRow key={property.id}>
                        <TableCell>
                            {images.length > 0 ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                    src={`/api/crm/images/${images[0]}`}
                                    alt={property.name}
                                    className="h-12 w-16 rounded object-cover"
                                />
                            ) : (
                                <div className="flex h-12 w-16 items-center justify-center rounded bg-muted">
                                    <Building2 className="h-5 w-5 text-muted-foreground" />
                                </div>
                            )}
                        </TableCell>
                        <TableCell className="font-medium">
                            {property.name}
                            {images.length > 1 && (
                                <span className="ml-2 text-xs text-muted-foreground">+{images.length - 1} poze</span>
                            )}
                        </TableCell>
                        <TableCell className="max-w-[280px]">
                            <span className="line-clamp-2 text-sm text-muted-foreground">
                                {property.description || "—"}
                            </span>
                        </TableCell>
                        <TableCell className="whitespace-nowrap font-medium">
                            {formatPrice(property.price, property.currency)}
                        </TableCell>
                        <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                                <Button
                                    variant="default"
                                    size="sm"
                                    onClick={() => openSendDialog(property)}
                                >
                                    <Send className="mr-1 h-4 w-4" /> Trimite
                                </Button>
                                <Button variant="ghost" size="icon" title="Editează" onClick={() => openPropertyDialog(property)}>
                                    <Pencil className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="icon" title="Șterge" onClick={() => deleteProperty(property)}>
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                            </div>
                        </TableCell>
                    </TableRow>
                );
            });

    return (
        <div className="min-h-screen bg-background">
            <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-8">
                {/* Header */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-4">
                    <div>
                        <h1 className="text-2xl font-bold">CRM Imobile</h1>
                        <p className="text-sm text-muted-foreground">
                            Trimite imobile clienților prin WhatsApp și urmărește răspunsurile lor.
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        {connectedSessions.length > 0 ? (
                            <Badge variant="outline" className="gap-1.5 border-green-600/50 text-green-700">
                                <span className="h-2 w-2 rounded-full bg-green-500" />
                                WhatsApp conectat
                            </Badge>
                        ) : (
                            <Button variant="outline" onClick={() => setConnectOpen(true)}>
                                <QrCode className="mr-1 h-4 w-4" /> Conectează WhatsApp
                            </Button>
                        )}
                        <Button variant="ghost" size="icon" title="Deconectare" onClick={() => signOut({ callbackUrl: "/auth/login" })}>
                            <LogOut className="h-4 w-4" />
                        </Button>
                    </div>
                </div>

                <Tabs defaultValue="properties">
                    <TabsList>
                        <TabsTrigger value="properties" className="gap-1">
                            <Building2 className="h-4 w-4" /> Imobile
                        </TabsTrigger>
                        <TabsTrigger value="clients" className="gap-1">
                            <Users className="h-4 w-4" /> Clienți
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="properties">
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0">
                                <div>
                                    <CardTitle>Imobile</CardTitle>
                                    <CardDescription>Lista ta de imobile pe care le poți trimite clienților.</CardDescription>
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="relative">
                                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                        <Input
                                            placeholder="Caută imobil…"
                                            className="w-48 pl-8"
                                            value={propertySearch}
                                            onChange={(e) => setPropertySearch(e.target.value)}
                                        />
                                    </div>
                                    <Button onClick={() => openPropertyDialog()}>
                                        <Plus className="mr-1 h-4 w-4" /> Imobil nou
                                    </Button>
                                </div>
                            </CardHeader>
                            <CardContent>
                                {loading ? (
                                    <div className="flex justify-center py-10">
                                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                                    </div>
                                ) : properties.length === 0 ? (
                                    <p className="py-10 text-center text-sm text-muted-foreground">
                                        Niciun imobil încă. Apasă „Imobil nou” pentru a adăuga primul.
                                    </p>
                                ) : (
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead className="w-20">Poză</TableHead>
                                                <TableHead>Nume</TableHead>
                                                <TableHead>Descriere</TableHead>
                                                <TableHead>Preț</TableHead>
                                                <TableHead className="text-right">Acțiuni</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>{renderPropertyRows()}</TableBody>
                                    </Table>
                                )}
                            </CardContent>
                        </Card>
                    </TabsContent>

                    <TabsContent value="clients">
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0">
                                <div>
                                    <CardTitle>Clienți</CardTitle>
                                    <CardDescription>Clienții cărora le trimiți imobile pe WhatsApp.</CardDescription>
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="relative">
                                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                        <Input
                                            placeholder="Caută client…"
                                            className="w-48 pl-8"
                                            value={clientSearch}
                                            onChange={(e) => setClientSearch(e.target.value)}
                                        />
                                    </div>
                                    <Button onClick={() => openClientDialog()}>
                                        <Plus className="mr-1 h-4 w-4" /> Client nou
                                    </Button>
                                </div>
                            </CardHeader>
                            <CardContent>
                                {loading ? (
                                    <div className="flex justify-center py-10">
                                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                                    </div>
                                ) : clients.length === 0 ? (
                                    <p className="py-10 text-center text-sm text-muted-foreground">
                                        Niciun client încă. Apasă „Client nou” pentru a adăuga primul.
                                    </p>
                                ) : (
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Nume</TableHead>
                                                <TableHead>Email</TableHead>
                                                <TableHead>Telefon</TableHead>
                                                <TableHead>Trimiteri</TableHead>
                                                <TableHead className="text-right">Acțiuni</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>{renderClientRows()}</TableBody>
                                    </Table>
                                )}
                            </CardContent>
                        </Card>
                    </TabsContent>
                </Tabs>

                {/* ---------- WhatsApp connect dialog ---------- */}
                <Dialog open={connectOpen} onOpenChange={(open) => { setConnectOpen(open); if (!open) { setQrTarget(null); setQrBase64(null); } }}>
                    <DialogContent className="sm:max-w-md">
                        <DialogHeader>
                            <DialogTitle>Conectează WhatsApp</DialogTitle>
                            <DialogDescription>
                                Pe telefon: WhatsApp → Setări → Dispozitive conectate → Conectează un dispozitiv, apoi scanează codul.
                            </DialogDescription>
                        </DialogHeader>

                        {sessions.length > 0 && (
                            <div className="space-y-2">
                                {sessions.map((s) => (
                                    <div key={s.sessionId} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                                        <span className="font-medium">{s.name}</span>
                                        {s.status === "CONNECTED" ? (
                                            <Badge variant="outline" className="gap-1.5 border-green-600/50 text-green-700">
                                                <span className="h-2 w-2 rounded-full bg-green-500" /> Conectat
                                            </Badge>
                                        ) : (
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => { setQrBase64(null); setQrTarget(s.sessionId); }}
                                            >
                                                <QrCode className="mr-1 h-4 w-4" /> Arată QR
                                            </Button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}

                        {qrTarget && (
                            <div className="flex flex-col items-center gap-2 rounded-md border p-4">
                                {qrBase64 ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={qrBase64} alt="Cod QR WhatsApp" className="h-56 w-56" />
                                ) : (
                                    <div className="flex h-56 w-56 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
                                        <Loader2 className="h-6 w-6 animate-spin" />
                                        Se așteaptă codul QR…
                                    </div>
                                )}
                                <p className="text-center text-xs text-muted-foreground">
                                    Codul se reîmprospătează automat. După scanare, starea va deveni „Conectat”.
                                </p>
                            </div>
                        )}

                        <DialogFooter className="flex-row justify-between sm:justify-between">
                            <Button variant="outline" onClick={createSession} disabled={creatingSession}>
                                {creatingSession && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                                Sesiune nouă
                            </Button>
                            <Button variant="outline" onClick={() => setConnectOpen(false)}>Închide</Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                {/* ---------- Client dialog ---------- */}
                <Dialog open={clientDialogOpen} onOpenChange={setClientDialogOpen}>
                    <DialogContent className="sm:max-w-md">
                        <DialogHeader>
                            <DialogTitle>{editingClient ? "Editează client" : "Client nou"}</DialogTitle>
                            <DialogDescription>Completează datele de contact ale clientului.</DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="client-name">Nume *</Label>
                                <Input
                                    id="client-name"
                                    value={clientForm.name}
                                    onChange={(e) => setClientForm({ ...clientForm, name: e.target.value })}
                                    placeholder="ex: Ion Popescu"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="client-email">Email</Label>
                                <Input
                                    id="client-email"
                                    type="email"
                                    value={clientForm.email}
                                    onChange={(e) => setClientForm({ ...clientForm, email: e.target.value })}
                                    placeholder="ex: ion@email.com"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="client-phone">Telefon (WhatsApp) *</Label>
                                <Input
                                    id="client-phone"
                                    value={clientForm.phone}
                                    onChange={(e) => setClientForm({ ...clientForm, phone: e.target.value })}
                                    placeholder="ex: 0740 123 456 sau +40 740 123 456"
                                />
                                <p className="text-xs text-muted-foreground">
                                    Se folosește pentru trimiterea pe WhatsApp. Fără țară se consideră +40.
                                </p>
                            </div>
                        </div>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setClientDialogOpen(false)}>
                                Anulează
                            </Button>
                            <Button onClick={saveClient} disabled={savingClient || !clientForm.name.trim() || !clientForm.phone.trim()}>
                                {savingClient && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                                Salvează
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                {/* ---------- Property dialog ---------- */}
                <Dialog open={propertyDialogOpen} onOpenChange={setPropertyDialogOpen}>
                    <DialogContent className="sm:max-w-lg">
                        <DialogHeader>
                            <DialogTitle>{editingProperty ? "Editează imobil" : "Imobil nou"}</DialogTitle>
                            <DialogDescription>Detaliile imobilului care vor apărea în mesajul WhatsApp.</DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="property-name">Nume *</Label>
                                <Input
                                    id="property-name"
                                    value={propertyForm.name}
                                    onChange={(e) => setPropertyForm({ ...propertyForm, name: e.target.value })}
                                    placeholder="ex: Apartament 3 camere, zona Centru"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="property-description">Descriere</Label>
                                <Textarea
                                    id="property-description"
                                    rows={3}
                                    value={propertyForm.description}
                                    onChange={(e) => setPropertyForm({ ...propertyForm, description: e.target.value })}
                                    placeholder="ex: Etaj 2, mobilat, 65 mp, parcare subterană…"
                                />
                            </div>
                            <div className="grid grid-cols-3 gap-3">
                                <div className="col-span-2 space-y-2">
                                    <Label htmlFor="property-price">Preț</Label>
                                    <Input
                                        id="property-price"
                                        type="number"
                                        min="0"
                                        value={propertyForm.price}
                                        onChange={(e) => setPropertyForm({ ...propertyForm, price: e.target.value })}
                                        placeholder="ex: 85000"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>Monedă</Label>
                                    <Select
                                        value={propertyForm.currency}
                                        onValueChange={(v) => setPropertyForm({ ...propertyForm, currency: v })}
                                    >
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {CURRENCIES.map((c) => (
                                                <SelectItem key={c} value={c}>{c}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label>Poze</Label>
                                {editingProperty && propertyImages(editingProperty).length > 0 && (
                                    <div className="flex flex-wrap gap-2">
                                        {propertyImages(editingProperty).map((name) => (
                                            <div key={name} className="group relative">
                                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                                <img
                                                    src={`/api/crm/images/${name}`}
                                                    alt="Poză imobil"
                                                    className="h-16 w-20 rounded object-cover"
                                                />
                                                <button
                                                    type="button"
                                                    className="absolute -right-1.5 -top-1.5 rounded-full bg-destructive p-0.5 text-destructive-foreground opacity-0 transition group-hover:opacity-100"
                                                    title="Șterge poza"
                                                    onClick={async () => {
                                                        const res = await fetch(
                                                            `/api/crm/properties/${editingProperty.id}/images?name=${encodeURIComponent(name)}`,
                                                            { method: "DELETE" }
                                                        );
                                                        const data = await res.json();
                                                        if (data.status) {
                                                            toast.success("Poză ștearsă");
                                                            setEditingProperty({
                                                                ...editingProperty,
                                                                images: data.data.images,
                                                            });
                                                        } else {
                                                            toast.error("Nu am putut șterge poza");
                                                        }
                                                    }}
                                                >
                                                    <X className="h-3 w-3" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                {newImages.length > 0 && (
                                    <div className="flex flex-wrap gap-2">
                                        {newImages.map((file, idx) => (
                                            <div key={idx} className="group relative">
                                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                                <img
                                                    src={URL.createObjectURL(file)}
                                                    alt={file.name}
                                                    className="h-16 w-20 rounded object-cover"
                                                />
                                                <button
                                                    type="button"
                                                    className="absolute -right-1.5 -top-1.5 rounded-full bg-destructive p-0.5 text-destructive-foreground opacity-0 transition group-hover:opacity-100"
                                                    title="Scoate poza"
                                                    onClick={() => setNewImages(newImages.filter((_, i) => i !== idx))}
                                                >
                                                    <X className="h-3 w-3" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                <label className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed p-3 text-sm text-muted-foreground hover:bg-muted/50">
                                    <ImagePlus className="h-4 w-4" />
                                    Adaugă poze (JPG, PNG, WEBP — max 10 MB)
                                    <input
                                        type="file"
                                        accept="image/jpeg,image/png,image/webp,image/gif"
                                        multiple
                                        className="hidden"
                                        onChange={(e) => {
                                            const files = Array.from(e.target.files || []);
                                            setNewImages((prev) => [...prev, ...files]);
                                            e.target.value = "";
                                        }}
                                    />
                                </label>
                            </div>
                        </div>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setPropertyDialogOpen(false)}>
                                Anulează
                            </Button>
                            <Button onClick={saveProperty} disabled={savingProperty || !propertyForm.name.trim()}>
                                {savingProperty && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                                Salvează
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                {/* ---------- Send dialog ---------- */}
                <Dialog open={sendDialogOpen} onOpenChange={setSendDialogOpen}>
                    <DialogContent className="sm:max-w-lg">
                        <DialogHeader>
                            <DialogTitle>Trimite imobilul pe WhatsApp</DialogTitle>
                            <DialogDescription>
                                {sendProperty ? `${sendProperty.name} — ${formatPrice(sendProperty.price, sendProperty.currency)}` : ""}
                            </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <Label>Sesiune WhatsApp</Label>
                                <Select value={sendSessionId} onValueChange={setSendSessionId}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Alege sesiunea" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {connectedSessions.map((s) => (
                                            <SelectItem key={s.sessionId} value={s.sessionId}>
                                                {s.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label>Clienți ({sendClientIds.size} selectați)</Label>
                                <ScrollArea className="h-40 rounded-md border p-2">
                                    <div className="space-y-1">
                                        {clients.map((client) => (
                                            <label
                                                key={client.id}
                                                className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted"
                                            >
                                                <Checkbox
                                                    checked={sendClientIds.has(client.id)}
                                                    onCheckedChange={() => toggleSendClient(client.id)}
                                                />
                                                <span className="font-medium">{client.name}</span>
                                                <span className="text-muted-foreground">{formatPhone(client.phone)}</span>
                                            </label>
                                        ))}
                                    </div>
                                </ScrollArea>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="send-message">Mesaj</Label>
                                <Textarea
                                    id="send-message"
                                    rows={6}
                                    value={sendMessage}
                                    onChange={(e) => setSendMessage(e.target.value)}
                                />
                                <p className="text-xs text-muted-foreground">
                                    Prima poză va fi trimisă cu acest text; restul pozelor se trimit separat.
                                </p>
                            </div>
                        </div>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setSendDialogOpen(false)}>
                                Anulează
                            </Button>
                            <Button onClick={doSend} disabled={sending || sendClientIds.size === 0}>
                                {sending ? (
                                    <>
                                        <Loader2 className="mr-1 h-4 w-4 animate-spin" /> Se trimite…
                                    </>
                                ) : (
                                    <>
                                        <Send className="mr-1 h-4 w-4" /> Trimite la {sendClientIds.size} clienți
                                    </>
                                )}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                {/* ---------- Conversation sheet ---------- */}
                <Sheet
                    open={!!convClient}
                    onOpenChange={(open) => {
                        if (!open) setConvClient(null);
                    }}
                >
                    <SheetContent className="flex w-full flex-col sm:max-w-md">
                        <SheetHeader>
                            <SheetTitle>{convClient?.name}</SheetTitle>
                            <SheetDescription>
                                {convClient ? formatPhone(convClient.phone) : ""}
                            </SheetDescription>
                        </SheetHeader>
                        <div className="mb-2 flex items-center justify-between">
                            <span className="text-xs text-muted-foreground">Actualizare automată la 10 secunde</span>
                            <Button
                                variant="ghost"
                                size="icon"
                                title="Reîmprospătează"
                                onClick={() => convClient && loadConversation(convClient, convSessionId)}
                            >
                                <RefreshCw className="h-4 w-4" />
                            </Button>
                        </div>
                        <ScrollArea className="flex-1 pr-2">
                            {convLoading ? (
                                <div className="flex justify-center py-10">
                                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                                </div>
                            ) : timeline.length === 0 ? (
                                <p className="py-10 text-center text-sm text-muted-foreground">
                                    Niciun mesaj încă. Trimite un imobil ca să începi conversația.
                                </p>
                            ) : (
                                <div className="space-y-3 pb-4">
                                    {timeline.map((item) =>
                                        item.kind === "send" ? (
                                            <div key={item.id} className="flex justify-end">
                                                <div className="max-w-[80%] rounded-lg bg-primary/10 px-3 py-2 text-sm">
                                                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                                        <Building2 className="h-3 w-3" />
                                                        Imobil trimis: {item.property?.name}
                                                        {item.status === "FAILED" && (
                                                            <Badge variant="destructive" className="ml-1 h-4 px-1 text-[10px]">
                                                                Eșuat
                                                            </Badge>
                                                        )}
                                                    </div>
                                                    {item.error && (
                                                        <p className="mt-1 text-xs text-destructive">{item.error}</p>
                                                    )}
                                                    <p className="mt-1 text-right text-[10px] text-muted-foreground">
                                                        {formatTime(item.sentAt)}
                                                    </p>
                                                </div>
                                            </div>
                                        ) : (
                                            <div
                                                key={item.id}
                                                className={`flex ${item.fromMe ? "justify-end" : "justify-start"}`}
                                            >
                                                <div
                                                    className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                                                        item.fromMe
                                                            ? "bg-primary text-primary-foreground"
                                                            : "bg-muted"
                                                    }`}
                                                >
                                                    {item.type === "IMAGE" && item.mediaUrl && (
                                                        // eslint-disable-next-line @next/next/no-img-element
                                                        <img
                                                            src={item.mediaUrl}
                                                            alt="Poză"
                                                            className="mb-1 max-h-52 rounded object-cover"
                                                        />
                                                    )}
                                                    {item.content && <p className="whitespace-pre-wrap">{item.content}</p>}
                                                    {!item.content && item.type !== "IMAGE" && (
                                                        <p className="text-xs opacity-70">[{item.type}]</p>
                                                    )}
                                                    <p className={`mt-1 text-right text-[10px] ${item.fromMe ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                                                        {formatTime(item.timestamp)}
                                                    </p>
                                                </div>
                                            </div>
                                        )
                                    )}
                                    <div ref={convBottomRef} />
                                </div>
                            )}
                        </ScrollArea>
                    </SheetContent>
                </Sheet>
            </div>
        </div>
    );
}
