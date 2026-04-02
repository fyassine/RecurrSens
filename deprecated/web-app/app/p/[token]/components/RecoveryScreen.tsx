
import React from "react";
import { Button } from "@/components/ui/button";
import { CheckCircle, Mic, Star } from "lucide-react";

const RECOVERY_PLAN = [
  {
    week: 1,
    exercises: ["Aaaaa (2s)", "Iiiii (2s)", "Uuuuu (2s)", "Satz lesen"]
  },
  {
    week: 2,
    exercises: ["Aaaaa (3s)", "Iiiii (3s)", "Uuuuu (3s)", "Satz lesen"]
  },
  {
    week: 3,
    exercises: ["Aaaaa (4s)", "Iiiii (4s)", "Uuuuu (4s)", "Satz lesen"]
  }
];

export function RecoveryScreen() {
  return (
    <div className="max-w-xl mx-auto p-6 bg-white rounded-lg shadow space-y-10">
      <h2 className="text-2xl font-bold text-center text-blue-800 mb-2">Wiederaufbau-Plan</h2>
      <p className="text-center text-gray-600 mb-6">
        Folge jede Woche dem Übungsplan, um deine Stimme zu stärken. <br />
        <span className="font-semibold text-blue-700">Übungen</span> sind tägliche Aufgaben, die du selbstständig übst. <br />
        <span className="font-semibold text-yellow-700">Testaufnahme</span> ist eine wöchentliche Aufnahme zur Überprüfung deines Fortschritts.
      </p>
      <div className="space-y-10">
        {RECOVERY_PLAN.map((week) => (
          <div key={week.week} className="space-y-6">
            {/* Übungen Section */}
            <div className="border-l-4 border-blue-400 bg-blue-50 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <Star className="text-blue-400 w-5 h-5" />
                <span className="font-semibold text-blue-700 text-lg">Woche {week.week}: Übungen</span>
              </div>
              <div className="flex flex-wrap gap-3">
                {week.exercises.map((ex, idx) => (
                  <Button key={ex + idx} variant="outline" className="flex-1 min-w-[120px] border-blue-300">
                    {ex}
                  </Button>
                ))}
              </div>
              <div className="mt-4 flex gap-2">
                <Button variant="secondary" className="flex-1 flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-600" />
                  Übung abgeschlossen
                </Button>
              </div>
            </div>

            {/* Testaufnahme Section */}
            <div className="border-l-4 border-yellow-400 bg-yellow-50 rounded-lg p-4 mt-2">
              <div className="flex items-center gap-2 mb-2">
                <Mic className="text-yellow-500 w-5 h-5" />
                <span className="font-semibold text-yellow-700 text-lg">Testaufnahme</span>
              </div>
              <p className="text-yellow-900 mb-3 text-sm">Nimm einmal pro Woche eine Testaufnahme auf, um deinen Fortschritt zu dokumentieren.</p>
              <div className="flex gap-2">
                <Button variant="default" className="flex-1 bg-yellow-500 hover:bg-yellow-600 text-white flex items-center gap-2">
                  <Mic className="w-4 h-4" />
                  Testaufnahme starten
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
