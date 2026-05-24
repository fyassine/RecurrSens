import { useState } from 'react';
import { Text, useMantineTheme } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { FileText, Copy, Check, ExternalLink, ArrowRight } from 'lucide-react';
import { downloadPatientPdf } from '../api/client';

interface ActionRowProps {
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
  label: string;
  description: string;
  onClick?: () => void;
  href?: string;
  target?: string;
}

function ActionRow({ icon, iconBg, iconColor, label, description, onClick, href, target }: ActionRowProps) {
  const isLink = !!href;
  const Tag = (isLink ? 'a' : 'div') as 'a';
  return (
    <Tag
      href={isLink ? href : undefined}
      target={isLink ? target : undefined}
      rel={target === '_blank' ? 'noopener noreferrer' : undefined}
      onClick={onClick}
      className="flex cursor-pointer items-center gap-4 rounded-lg px-3 py-2.5 text-inherit no-underline transition-colors hover:bg-[var(--mantine-color-default-hover)]"
    >
      <div
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md"
        style={{ backgroundColor: iconBg, color: iconColor }}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <Text size="sm" fw={600} lh={1.35}>{label}</Text>
        <Text size="xs" c="dimmed" lh={1.35} mt={2}>{description}</Text>
      </div>
    </Tag>
  );
}

export default function PatientAccessOptions({
  patientId,
}: {
  patientId: string;
  patientLabel?: string;
}) {
  const theme = useMantineTheme();
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(`${window.location.origin}/p/${patientId}`);
    setCopied(true);
    notifications.show({ message: 'Link kopiert!', color: 'green' });
    setTimeout(() => setCopied(false), 2000);
  };

  const primary = theme.colors.brand[6];
  const info = theme.colors.cyan[6];
  const warning = theme.colors.yellow[6];
  const error = theme.colors.red[6];
  const tint = (hex: string) => `${hex}20`;

  return (
    <div className="flex flex-col gap-1 py-1">
      <ActionRow
        icon={<ArrowRight size={20} />}
        iconBg={tint(primary)}
        iconColor={primary}
        label="Details anzeigen"
        description="Patientenakte in der Klinikübersicht öffnen"
        href={`/details/${patientId}`}
      />
      <ActionRow
        icon={copied ? <Check size={20} /> : <Copy size={20} />}
        iconBg={tint(info)}
        iconColor={info}
        label={copied ? 'In Zwischenablage kopiert!' : 'Patienten-Link kopieren'}
        description="Direkten Link mit dem Patienten teilen"
        onClick={handleCopy}
      />
      <ActionRow
        icon={<FileText size={20} />}
        iconBg={tint(warning)}
        iconColor={warning}
        label="PDF öffnen"
        description="Enthält QR-Code für einfachen Zugang"
        onClick={() => downloadPatientPdf(patientId)}
      />
      <ActionRow
        icon={<ExternalLink size={20} />}
        iconBg={tint(error)}
        iconColor={error}
        label="Patienten-Aufnahme öffnen"
        description="Patienten-seitige Aufnahme-App öffnen"
        href={`/p/${patientId}`}
        target="_blank"
      />
    </div>
  );
}
