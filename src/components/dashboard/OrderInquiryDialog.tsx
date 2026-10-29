import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle2, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Props {
  orderId: string;
  auftragsNr: string;
  empfaenger: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function OrderInquiryDialog({ orderId, auftragsNr, empfaenger, open, onOpenChange }: Props) {
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);

  const close = (o: boolean) => {
    onOpenChange(o);
    if (!o) { setMessage(""); setDone(false); }
  };

  const send = async () => {
    if (message.trim().length < 3 || sending) return;
    setSending(true);
    const { data, error } = await supabase.functions.invoke("merchant-order-inquiry", {
      body: { orderId, message: message.trim() },
    });
    setSending(false);
    if (error || !data?.success) {
      toast.error("Senden fehlgeschlagen. Bitte versuchen Sie es erneut.");
      return;
    }
    setDone(true);
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nachfrage zur Sendung</DialogTitle>
          <DialogDescription>{auftragsNr} · {empfaenger}</DialogDescription>
        </DialogHeader>
        {done ? (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <CheckCircle2 className="h-10 w-10 text-success" />
            <p className="font-medium">Senden erfolgreich, wir melden uns so schnell es geht bei Ihnen.</p>
          </div>
        ) : (
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Beschreiben Sie kurz Ihr Anliegen, z. B. Kunde meldet, dass das Paket nicht angekommen ist."
            rows={6}
            maxLength={2000}
          />
        )}
        <DialogFooter>
          {done ? (
            <Button onClick={() => close(false)}>Schließen</Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => close(false)}>Abbrechen</Button>
              <Button onClick={send} disabled={sending || message.trim().length < 3}>
                {sending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Nachfrage senden
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
