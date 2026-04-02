import React from 'react';

export function StatusBadge({ status }: { status: string }) {
  const styles = {
    NEW: "bg-gray-100 text-gray-700",
    CONSENT_GIVEN: "bg-blue-50 text-blue-700",
    DEMOGRAPHICS_DONE: "bg-indigo-50 text-indigo-700",
    PRE_OP_DONE: "bg-purple-50 text-purple-700",
    POST_OP_STARTED: "bg-orange-50 text-orange-700",
    POST_OP_DONE: "bg-teal-50 text-teal-700",
    COMPLETED: "bg-green-50 text-green-700",
  };

  const labels: Record<string, string> = {
    NEW: "Einwilligung",
    CONSENT_GIVEN: "Demografie",
    DEMOGRAPHICS_DONE: "Prä-OP",
    PRE_OP_DONE: "Freigabe",
    POST_OP_STARTED: "Post-OP",
    POST_OP_DONE: "Aufnahmen fertig",
    COMPLETED: "Abgeschlossen",
  };

  const label = labels[status] || status.replace(/_/g, " ").toLowerCase();
  const className = styles[status as keyof typeof styles] || "bg-gray-100 text-gray-700";

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize w-fit ${className}`}>
      {label}
    </span>
  );
}

export function DiagnosisBadge({
  value,
  type = "diagnosis",
  percentage,
  gradcamPrediction,
  gradcamPercentage,
}: {
  value: string;
  type?: "diagnosis" | "prediction";
  percentage?: number;
  gradcamPrediction?: string;
  gradcamPercentage?: number;
}) {
  // Extended styles and labels for manual diagnosis
  const diagnosisStyles = {
    TODO: "bg-gray-100 text-gray-500",
    LEFT: "bg-pink-50 text-blue-700 border border-blue-200",
    RIGHT: "bg-pink-50 text-pink-700 border border-pink-200",
    BOTH: "bg-pink-50 text-purple-700 border border-purple-200",
    HEALTHY: "bg-green-50 text-green-700 border border-green-200",
  };
  const diagnosisLabels: Record<string, string> = {
    TODO: "Ausstehend",
    LEFT: "Linksseitige RP",
    RIGHT: "Rechtsseitige RP",
    BOTH: "Beidseitige RP",
    HEALTHY: "Keine RP",
  };
  const predictionStyles = {
    TODO: "bg-gray-100 text-gray-500",
    INFECTED: "bg-red-50 text-red-700",
    HEALTHY: "bg-green-50 text-green-700",
  };
  const predictionLabels: Record<string, string> = {
    TODO: "Ausstehend",
    INFECTED: "RP",
    HEALTHY: "keine RP",
  };
  const isDiagnosis = type === 'diagnosis';
  const styles = isDiagnosis ? diagnosisStyles : predictionStyles;
  const labels = isDiagnosis ? diagnosisLabels : predictionLabels;
  const gradcamLabels = predictionLabels;
  const className = styles[value as keyof typeof styles] || "bg-gray-100 text-gray-500";
  const gradcamClassName = gradcamPrediction ? styles[gradcamPrediction.toUpperCase() as keyof typeof styles] || "bg-gray-100 text-gray-500" : "";

  return (
    <div className="flex items-center gap-2">
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${className}`}>
        <span className="font-bold mr-1">FiLM:</span>
        {labels[value] || value}
        {percentage !== undefined && percentage > 0 && (
          <span className="ml-1 opacity-75">({percentage.toFixed(2)}%)</span>
        )}
      </span>
      {gradcamPrediction && (
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${gradcamClassName}`}>
          <span className="font-bold mr-1">GC:</span>
          {gradcamLabels[gradcamPrediction.toUpperCase()] || gradcamPrediction}
          {gradcamPercentage !== undefined && gradcamPercentage > 0 && (
            <span className="ml-1 opacity-75">({gradcamPercentage.toFixed(2)}%)</span>
          )}
        </span>
      )}
    </div>
  );
}
