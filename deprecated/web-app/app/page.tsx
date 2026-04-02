import { getAllPatients } from "@/lib/api";
import { CreatePatientDialog } from "@/components/dashboard/CreatePatientDialog";
import { PatientList } from "@/components/dashboard/PatientList";

export const dynamic = 'force-dynamic';


import { ExportDataButton } from "@/components/dashboard/ExportDataButton";

export default async function Dashboard() {
  const patients = await getAllPatients();

  // Dummy export handler (replace with real export logic as needed)
  function handleExport() {
    // This will be replaced by a real export/download implementation
    alert("Exportfunktion ist noch nicht implementiert.");
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-8 font-sans">
      <div className="max-w-7xl mx-auto space-y-8">
        <header className="flex flex-col md:flex-row justify-between items-center gap-4 pb-6 border-b border-gray-200">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-gray-900">Recurrensparese Diagnose</h1>
            <p className="text-gray-500 mt-1">Verwalten Sie Patientenaufnahmen und Daten.</p>
          </div>
          <div className="flex gap-2 w-full md:w-auto justify-end">
            <ExportDataButton />
            <CreatePatientDialog />
          </div>
        </header>

        <main>
          <PatientList patients={patients} />
        </main>
      </div>
    </div>
  );
}
