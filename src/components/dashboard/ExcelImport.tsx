import { useState, useCallback } from "react";
import * as XLSX from "xlsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Upload, FileSpreadsheet, CheckCircle2, X, Download } from "lucide-react";
import { toast } from "sonner";
import { Order } from "@/types/order";

interface ExcelImportProps {
  onImport: (orders: Omit<Order, "id" | "auftragsNr" | "erstelltAm" | "status">[]) => void;
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
  notizen?: string;
}

const COLUMN_MAP: Record<string, keyof PreviewRow> = {
  absender: "absenderName",
  "absender name": "absenderName",
  absendername: "absenderName",
  "absender adresse": "absenderAdresse",
  absenderadresse: "absenderAdresse",
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
  notizen: "notizen",
  bemerkung: "notizen",
};

const TEMPLATE_HEADERS = [
  "Absender Name",
  "Absender Adresse",
  "Empfänger Name",
  "Straße",
  "PLZ",
  "Stadt",
  "E-Mail",
  "Telefon",
  "Pakete",
  "Gewicht (kg)",
  "Notizen",
];

const TEMPLATE_EXAMPLE = [
  "Meine Firma GmbH",
  "Hauptstr. 1, 45127 Essen",
  "Max Mustermann",
  "Bahnhofstr. 5",
  "44137",
  "Dortmund",
  "max@beispiel.de",
  "0231 1234567",
  "2",
  "5.5",
  "Zerbrechlich",
];

function downloadTemplate() {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([TEMPLATE_HEADERS, TEMPLATE_EXAMPLE]);

  // Set column widths
  ws["!cols"] = TEMPLATE_HEADERS.map((h) => ({ wch: Math.max(h.length + 4, 16) }));

  XLSX.utils.book_append_sheet(wb, ws, "Aufträge");
  XLSX.writeFile(wb, "Auftraege_Vorlage.xlsx");
}

export function ExcelImport({ onImport }: ExcelImportProps) {
  const [preview, setPreview] = useState<PreviewRow[]>([]);
  const [fileName, setFileName] = useState("");

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
          const mapped: Partial<PreviewRow> = {};
          Object.entries(row).forEach(([key, val]) => {
            const normalized = key.toLowerCase().trim();
            const field = COLUMN_MAP[normalized];
            if (field) {
              if (field === "pakete") mapped[field] = Number(val) || 1;
              else if (field === "gewicht") mapped[field] = Number(val) || 0;
              else mapped[field] = String(val || "");
            }
          });
          return {
            absenderName: mapped.absenderName || "",
            absenderAdresse: mapped.absenderAdresse || "",
            empfaengerName: mapped.empfaengerName || "",
            empfaengerAdresse: mapped.empfaengerAdresse || "",
            empfaengerPlz: mapped.empfaengerPlz || "",
            empfaengerStadt: mapped.empfaengerStadt || "",
            empfaengerEmail: mapped.empfaengerEmail,
            empfaengerTelefon: mapped.empfaengerTelefon,
            pakete: mapped.pakete || 1,
            gewicht: mapped.gewicht || 0,
            notizen: mapped.notizen,
          };
        });

        setPreview(rows);
        toast.success(`${rows.length} Zeilen aus "${file.name}" gelesen`);
      } catch {
        toast.error("Fehler beim Lesen der Datei");
      }
    };
    reader.readAsArrayBuffer(file);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

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
  };

  const clearPreview = () => {
    setPreview([]);
    setFileName("");
  };

  return (
    <div className="space-y-6">
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
            <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={downloadTemplate}>
              <Download className="h-3.5 w-3.5" />
              Vorlage herunterladen
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2 text-xs">
            {TEMPLATE_HEADERS.map((col) => (
              <span key={col} className="rounded-md bg-muted px-2.5 py-1 text-muted-foreground">
                {col}
              </span>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Preview */}
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
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.slice(0, 10).map((row, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium">{row.empfaengerName}</TableCell>
                      <TableCell>{row.empfaengerAdresse}</TableCell>
                      <TableCell>{row.empfaengerPlz}</TableCell>
                      <TableCell>{row.empfaengerStadt}</TableCell>
                      <TableCell className="text-muted-foreground">{row.empfaengerEmail || "–"}</TableCell>
                      <TableCell className="text-muted-foreground">{row.empfaengerTelefon || "–"}</TableCell>
                      <TableCell className="text-center">{row.pakete}</TableCell>
                      <TableCell className="text-right">{row.gewicht} kg</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {preview.length > 10 && (
                <p className="p-3 text-center text-xs text-muted-foreground">
                  ... und {preview.length - 10} weitere Zeilen
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
