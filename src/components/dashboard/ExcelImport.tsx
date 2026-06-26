import { useState, useCallback, useEffect } from "react";
import * as XLSX from "xlsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Upload, FileSpreadsheet, CheckCircle2, X, Download, Pencil, Save } from "lucide-react";
import { toast } from "sonner";
import { Order } from "@/types/order";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { fetchCoveredPostcodes, isCheckablePostcode, isCoveredPostcode } from "@/lib/deliveryCoverage";
import { Info } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type TemplateKey = "auto" | "standard" | "grosskunde";

function detectTemplate(headers: string[]): "standard" | "grosskunde" {
  const norm = new Set(headers.map(normalizeHeader));
  // Großkunde: hat sowohl "kunde" als auch "filiale" und/oder "lieferung"
  if (norm.has("kunde") && (norm.has("filiale") || norm.has("lieferung"))) {
    return "grosskunde";
  }
  return "standard";
}

interface ExcelImportProps {
  onImport: (orders: Omit<Order, "id" | "auftragsNr" | "erstelltAm" | "status">[]) => void;
  /** Override merchant context (admin import for a specific merchant). When set, profile lookup is skipped. */
  merchantIdOverride?: string | null;
  /** Override sender defaults (admin import). When provided, profile fetch is skipped. */
  senderOverride?: { name: string; adresse: string } | null;
}

interface PreviewRow {
  absenderName: string;
  absenderAdresse: string;
  empfaengerName: string;
  empfaengerAdresse: string;
  empfaengerPlz: string;
  empfaengerStadt: string;
  empfaengerEmail?: string;
  empfaengerTelefon?: string;
  pakete: number;
  gewicht: number;
  packageLengthCm?: number;
  packageWidthCm?: number;
  packageHeightCm?: number;
  notizen?: string;
}

const COLUMN_MAP: Record<string, keyof PreviewRow> = {
  empfänger: "empfaengerName",
  "empfänger name": "empfaengerName",
  empfängername: "empfaengerName",
  empfaenger: "empfaengerName",
  empfaengername: "empfaengerName",
  "empfänger adresse": "empfaengerAdresse",
  empfängeradresse: "empfaengerAdresse",
  empfaengeradresse: "empfaengerAdresse",
  straße: "empfaengerAdresse",
  strasse: "empfaengerAdresse",
  stadt: "empfaengerStadt",
  ort: "empfaengerStadt",
  plz: "empfaengerPlz",
  postleitzahl: "empfaengerPlz",
  email: "empfaengerEmail",
  "e-mail": "empfaengerEmail",
  telefon: "empfaengerTelefon",
  tel: "empfaengerTelefon",
  pakete: "pakete",
  anzahl: "pakete",
  gewicht: "gewicht",
  "gewicht (kg)": "gewicht",
  länge: "packageLengthCm",
  laenge: "packageLengthCm",
  "länge (cm)": "packageLengthCm",
  "laenge (cm)": "packageLengthCm",
  breite: "packageWidthCm",
  "breite (cm)": "packageWidthCm",
  höhe: "packageHeightCm",
  hoehe: "packageHeightCm",
  "höhe (cm)": "packageHeightCm",
  "hoehe (cm)": "packageHeightCm",
  notizen: "notizen",
  bemerkung: "notizen",
};

const TEMPLATE_HEADERS = [
  "Empfänger Name",
  "Straße",
  "PLZ",
  "Stadt",
  "E-Mail",
  "Telefon",
  "Pakete",
  "Gewicht (kg)",
  "Länge (cm)",
  "Breite (cm)",
  "Höhe (cm)",
  "Notizen",
];

const TEMPLATE_EXAMPLE = [
  "Max Mustermann",
  "Bahnhofstr. 5",
  "44137",
  "Dortmund",
  "max@beispiel.de",
  "0231 1234567",
  "2",
  "5.5",
  "40",
  "30",
  "20",
  "Zerbrechlich",
];

const GROSSKUNDE_HEADERS = [
  "Datum",
  "Postleitzahl",
  "Ort",
  "Straße",
  "Kunde",
  "Filiale",
  "Lieferung",
];

const GROSSKUNDE_EXAMPLE = [
  "26.06.2026",
  "44787",
  "Bochum",
  "Dorstener Str. 46",
  "Anja Mustermann",
  "5304",
  "5220266730",
];

function normalizeHeader(s: string): string {
  return s
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .trim();
}

function downloadTemplate(template: TemplateKey) {
  const wb = XLSX.utils.book_new();
  const headers = template === "grosskunde" ? GROSSKUNDE_HEADERS : TEMPLATE_HEADERS;
  const example = template === "grosskunde" ? GROSSKUNDE_EXAMPLE : TEMPLATE_EXAMPLE;
  const ws = XLSX.utils.aoa_to_sheet([headers, example]);
  ws["!cols"] = headers.map((h) => ({ wch: Math.max(h.length + 4, 16) }));
  XLSX.utils.book_append_sheet(wb, ws, "Aufträge");
  const fileName =
    template === "grosskunde" ? "Grosskunde_Vorlage.xlsx" : "Auftraege_Vorlage.xlsx";
  XLSX.writeFile(wb, fileName);
}

export function ExcelImport({ onImport, merchantIdOverride, senderOverride }: ExcelImportProps) {
  const { user, ownerUserId } = useAuth();
  const merchantId = merchantIdOverride ?? ownerUserId ?? user?.id ?? null;
  const [preview, setPreview] = useState<PreviewRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [editingRow, setEditingRow] = useState<number | null>(null);
  const [senderDefaults, setSenderDefaults] = useState({ name: "", adresse: "" });
  const [coveredPostcodes, setCoveredPostcodes] = useState<Set<string>>(new Set());
  const [template, setTemplate] = useState<TemplateKey>("standard");

  // Load profile for sender defaults
  useEffect(() => {
    if (senderOverride) {
      setSenderDefaults(senderOverride);
      return;
    }
    if (!merchantId) return;
    const load = async () => {
      const { data } = await supabase
        .from("profiles")
        .select("firma_name, ansprechpartner, strasse, plz, stadt")
        .eq("user_id", merchantId)
        .maybeSingle();
      if (data) {
        const name = data.firma_name || data.ansprechpartner || "";
        const parts = [data.strasse, data.plz, data.stadt].filter(Boolean);
        setSenderDefaults({ name, adresse: parts.join(", ") });
      }
    };
    load();
  }, [merchantId, senderOverride]);

  useEffect(() => {
    if (!user) return;

    const loadCoveredPostcodes = async () => {
      try {
        const postcodes = await fetchCoveredPostcodes();
        setCoveredPostcodes(postcodes);
      } catch {
        toast.error("Liefergebiet konnte nicht geladen werden");
      }
    };

    loadCoveredPostcodes();
  }, [user]);

  const handleFile = useCallback((file: File) => {
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);

        const rows: PreviewRow[] = json.map((row) => {
          if (template === "grosskunde") {
            const get = (header: string): string => {
              const target = normalizeHeader(header);
              for (const [k, v] of Object.entries(row)) {
                if (normalizeHeader(k) === target) {
                  if (v === null || v === undefined) return "";
                  return String(v).trim();
                }
              }
              return "";
            };
            const lieferung = get("Lieferung");
            const filiale = get("Filiale");
            const notizParts: string[] = [];
            if (lieferung) notizParts.push(`Lieferung ${lieferung}`);
            if (filiale) notizParts.push(`Filiale ${filiale}`);
            return {
              absenderName: senderDefaults.name,
              absenderAdresse: senderDefaults.adresse,
              empfaengerName: get("Kunde"),
              empfaengerAdresse: get("Straße"),
              empfaengerPlz: get("Postleitzahl"),
              empfaengerStadt: get("Ort"),
              empfaengerEmail: "",
              empfaengerTelefon: "",
              pakete: 1,
              gewicht: 0,
              packageLengthCm: 0,
              packageWidthCm: 0,
              packageHeightCm: 0,
              notizen: notizParts.join(" · "),
            };
          }
          const mapped: Partial<PreviewRow> = {};
          Object.entries(row).forEach(([key, val]) => {
            const normalized = key.toLowerCase().trim();
            const field = COLUMN_MAP[normalized];
            if (field) {
              if (field === "pakete") mapped[field] = Number(val) || 1;
              else if (field === "gewicht" || field === "packageLengthCm" || field === "packageWidthCm" || field === "packageHeightCm") mapped[field] = Number(val) || 0;
              else mapped[field] = String(val || "");
            }
          });
          return {
            absenderName: senderDefaults.name,
            absenderAdresse: senderDefaults.adresse,
            empfaengerName: mapped.empfaengerName || "",
            empfaengerAdresse: mapped.empfaengerAdresse || "",
            empfaengerPlz: mapped.empfaengerPlz || "",
            empfaengerStadt: mapped.empfaengerStadt || "",
            empfaengerEmail: mapped.empfaengerEmail,
            empfaengerTelefon: mapped.empfaengerTelefon,
            pakete: mapped.pakete || 1,
            gewicht: mapped.gewicht || 0,
            packageLengthCm: mapped.packageLengthCm || 0,
            packageWidthCm: mapped.packageWidthCm || 0,
            packageHeightCm: mapped.packageHeightCm || 0,
            notizen: mapped.notizen,
          };
        });

        setPreview(rows);
        setEditingRow(null);
        toast.success(`${rows.length} Zeilen aus "${file.name}" gelesen`);
      } catch {
        toast.error("Fehler beim Lesen der Datei");
      }
    };
    reader.readAsArrayBuffer(file);
  }, [senderDefaults, template]);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const updateRow = (index: number, field: keyof PreviewRow, value: string | number) => {
    setPreview((prev) =>
      prev.map((row, i) => (i === index ? { ...row, [field]: value } : row))
    );
  };

  const deleteRow = (index: number) => {
    setPreview((prev) => prev.filter((_, i) => i !== index));
  };

  const handleImport = () => {
    const valid = preview.filter((r) => r.empfaengerName && r.empfaengerStadt);
    if (valid.length === 0) {
      toast.error("Keine gültigen Zeilen gefunden (Empfänger Name und Stadt sind Pflicht)");
      return;
    }
    onImport(valid);
    toast.success(`${valid.length} Aufträge importiert`);
    setPreview([]);
    setFileName("");
    setEditingRow(null);
  };

  const clearPreview = () => {
    setPreview([]);
    setFileName("");
    setEditingRow(null);
  };

  const rowsOutsideDeliveryArea = preview.filter(
    (row) => isCheckablePostcode(row.empfaengerPlz) && !isCoveredPostcode(row.empfaengerPlz, coveredPostcodes)
  ).length;

  return (
    <div className="space-y-6">
      {/* Template selector */}
      <Card>
        <CardContent className="p-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium">Vorlage</p>
            <p className="text-xs text-muted-foreground">
              Wähle das Excel-Format, das du importieren möchtest.
            </p>
          </div>
          <Select value={template} onValueChange={(v) => setTemplate(v as TemplateKey)}>
            <SelectTrigger className="w-full sm:w-72">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="standard">Standard (e-cargo Vorlage)</SelectItem>
              <SelectItem value="grosskunde">Großkunde (Filiale / Lieferung)</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Sender info from profile */}
      {senderDefaults.name && (
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
              Absender wird automatisch aus Ihrem Profil übernommen
            </p>
            <p className="text-sm font-medium">{senderDefaults.name}</p>
            {senderDefaults.adresse && (
              <p className="text-sm text-muted-foreground">{senderDefaults.adresse}</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Upload zone */}
      <Card className="border-dashed border-2 border-border/70">
        <CardContent className="p-0">
          <label
            className="flex cursor-pointer flex-col items-center justify-center gap-3 p-12 text-center transition-colors hover:bg-muted/50"
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
          >
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
              <Upload className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="font-medium text-foreground">
                Excel-Datei hierher ziehen oder <span className="text-primary underline">durchsuchen</span>
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Unterstützt: .xlsx, .xls, .csv
              </p>
            </div>
            <input
              type="file"
              className="hidden"
              accept=".xlsx,.xls,.csv"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
              }}
            />
          </label>
        </CardContent>
      </Card>

      {/* Template download + column info */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium text-muted-foreground">Erwartete Spalten</CardTitle>
            <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={() => downloadTemplate(template)}>
              <Download className="h-3.5 w-3.5" />
              Vorlage herunterladen
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2 text-xs">
            {(template === "grosskunde" ? GROSSKUNDE_HEADERS : TEMPLATE_HEADERS).map((col) => (
              <span key={col} className="rounded-md bg-muted px-2.5 py-1 text-muted-foreground">
                {col}
              </span>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Preview with inline editing */}
      {preview.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4 text-primary" />
              <CardTitle className="text-sm">
                Vorschau: {fileName} ({preview.length} Zeilen)
              </CardTitle>
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={clearPreview}>
                <X className="mr-1 h-3 w-3" />
                Abbrechen
              </Button>
              <Button size="sm" onClick={handleImport}>
                <CheckCircle2 className="mr-1 h-3 w-3" />
                Importieren
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {rowsOutsideDeliveryArea > 0 && (
              <div className="border-b border-border/60 px-6 py-4">
                <Alert className="border-border/60 bg-muted/40 text-foreground">
                  <Info className="h-4 w-4" />
                  <AlertDescription>
                    {rowsOutsideDeliveryArea} {rowsOutsideDeliveryArea === 1 ? "Zeile liegt" : "Zeilen liegen"} außerhalb des Liefergebietes von e-cargo. Der Import bleibt trotzdem möglich.
                  </AlertDescription>
                </Alert>
              </div>
            )}
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead>Empfänger</TableHead>
                    <TableHead>Straße</TableHead>
                    <TableHead>PLZ</TableHead>
                    <TableHead>Stadt</TableHead>
                    <TableHead>E-Mail</TableHead>
                    <TableHead>Telefon</TableHead>
                    <TableHead className="text-center">Pakete</TableHead>
                    <TableHead className="text-right">Gewicht</TableHead>
                    <TableHead className="text-right">Maße</TableHead>
                    <TableHead className="w-20" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.map((row, i) => {
                    const isOutsideDeliveryArea =
                      isCheckablePostcode(row.empfaengerPlz) && !isCoveredPostcode(row.empfaengerPlz, coveredPostcodes);

                    return (
                    <TableRow key={i} className={isOutsideDeliveryArea ? "bg-muted/30" : undefined}>
                      {editingRow === i ? (
                        <>
                          <TableCell>
                            <Input className="h-7 text-sm" value={row.empfaengerName} onChange={(e) => updateRow(i, "empfaengerName", e.target.value)} />
                          </TableCell>
                          <TableCell>
                            <Input className="h-7 text-sm" value={row.empfaengerAdresse} onChange={(e) => updateRow(i, "empfaengerAdresse", e.target.value)} />
                          </TableCell>
                          <TableCell>
                            <Input className="h-7 text-sm w-20" value={row.empfaengerPlz} onChange={(e) => updateRow(i, "empfaengerPlz", e.target.value)} />
                          </TableCell>
                          <TableCell>
                            <Input className="h-7 text-sm" value={row.empfaengerStadt} onChange={(e) => updateRow(i, "empfaengerStadt", e.target.value)} />
                          </TableCell>
                          <TableCell>
                            <Input className="h-7 text-sm" value={row.empfaengerEmail || ""} onChange={(e) => updateRow(i, "empfaengerEmail", e.target.value)} />
                          </TableCell>
                          <TableCell>
                            <Input className="h-7 text-sm" value={row.empfaengerTelefon || ""} onChange={(e) => updateRow(i, "empfaengerTelefon", e.target.value)} />
                          </TableCell>
                          <TableCell>
                            <Input className="h-7 text-sm w-16 text-center" type="number" min={1} value={row.pakete} onChange={(e) => updateRow(i, "pakete", parseInt(e.target.value) || 1)} />
                          </TableCell>
                          <TableCell>
                            <Input className="h-7 text-sm w-20 text-right" type="number" min={0} step={0.1} value={row.gewicht} onChange={(e) => updateRow(i, "gewicht", parseFloat(e.target.value) || 0)} />
                          </TableCell>
                           <TableCell>
                             <div className="grid grid-cols-3 gap-1">
                               <Input className="h-7 text-sm text-right" type="number" min={0} step={0.1} value={row.packageLengthCm || 0} onChange={(e) => updateRow(i, "packageLengthCm", parseFloat(e.target.value) || 0)} />
                               <Input className="h-7 text-sm text-right" type="number" min={0} step={0.1} value={row.packageWidthCm || 0} onChange={(e) => updateRow(i, "packageWidthCm", parseFloat(e.target.value) || 0)} />
                               <Input className="h-7 text-sm text-right" type="number" min={0} step={0.1} value={row.packageHeightCm || 0} onChange={(e) => updateRow(i, "packageHeightCm", parseFloat(e.target.value) || 0)} />
                             </div>
                           </TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingRow(null)}>
                                <Save className="h-3.5 w-3.5 text-primary" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteRow(i)}>
                                <X className="h-3.5 w-3.5 text-destructive" />
                              </Button>
                            </div>
                          </TableCell>
                        </>
                      ) : (
                        <>
                          <TableCell className="font-medium">{row.empfaengerName}</TableCell>
                          <TableCell>{row.empfaengerAdresse}</TableCell>
                           <TableCell>
                             <div className="space-y-1">
                               <span>{row.empfaengerPlz}</span>
                               {isOutsideDeliveryArea && (
                                 <p className="text-xs text-muted-foreground">
                                   Außerhalb des Liefergebietes
                                 </p>
                               )}
                             </div>
                           </TableCell>
                          <TableCell>{row.empfaengerStadt}</TableCell>
                          <TableCell className="text-muted-foreground">{row.empfaengerEmail || "–"}</TableCell>
                          <TableCell className="text-muted-foreground">{row.empfaengerTelefon || "–"}</TableCell>
                          <TableCell className="text-center">{row.pakete}</TableCell>
                          <TableCell className="text-right">{row.gewicht} kg</TableCell>
                           <TableCell className="text-right">{`${row.packageLengthCm || 0} × ${row.packageWidthCm || 0} × ${row.packageHeightCm || 0} cm`}</TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingRow(i)}>
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteRow(i)}>
                                <X className="h-3.5 w-3.5 text-destructive" />
                              </Button>
                            </div>
                          </TableCell>
                        </>
                      )}
                    </TableRow>
                  )})}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
