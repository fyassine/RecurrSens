import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import Link from "next/link";

export function ExportDataButton() {
  return (
    <Button asChild variant="outline" size="lg">
      <Link href="/api/export">
        <Download className="mr-2" />
        Daten exportieren
      </Link>
    </Button>
  );
}
