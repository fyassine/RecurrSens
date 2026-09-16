import { Badge, Group, HoverCard, Stack, Text, Divider } from '@mantine/core';
import { Smartphone, Laptop, Tablet, Mic, Info } from 'lucide-react';
import type { RecordingDeviceInfo } from '../utils/deviceInfo';

export default function AudioDeviceInfoBadge({
  info,
}: {
  info?: RecordingDeviceInfo | null;
}) {
  if (!info || Object.keys(info).length === 0) return null;

  const parsed = info.parsed;
  const dev = info.device;
  const browser = info.browser;
  const mic = info.microphone;
  const fmt = info.audio_format;

  const devType = parsed?.device_type || dev?.type || 'Unbekannt';
  const devFamily = parsed?.device_family || dev?.family || dev?.model;
  const browserName = parsed?.browser || browser?.name;
  const osName = parsed?.os || browser?.os;
  const micLabel = mic?.label;

  const IconComponent =
    devType === 'Mobil'
      ? Smartphone
      : devType === 'Tablet'
        ? Tablet
        : devType === 'Desktop'
          ? Laptop
          : micLabel
            ? Mic
            : Info;

  // Short label on the pill/badge
  const summaryParts: string[] = [];
  if (devFamily && !['Generic Smartphone', 'Other', 'Unbekannt'].includes(devFamily)) {
    summaryParts.push(devFamily);
  } else if (devType && devType !== 'Unbekannt') {
    summaryParts.push(devType);
  }
  if (browserName) summaryParts.push(browserName);

  const badgeText = summaryParts.length > 0 ? summaryParts.join(' · ') : 'Gerätedetails';

  return (
    <HoverCard width={320} shadow="md" withArrow openDelay={200} closeDelay={150}>
      <HoverCard.Target>
        <Badge
          size="xs"
          variant="light"
          color="gray"
          className="cursor-pointer font-normal normal-case transition-colors hover:bg-[var(--mantine-color-gray-2)]"
          leftSection={<IconComponent size={12} />}
        >
          {badgeText}
        </Badge>
      </HoverCard.Target>
      <HoverCard.Dropdown p="xs">
        <Stack gap={6}>
          <Group justify="space-between">
            <Text size="xs" fw={700} c="dimmed">
              Aufnahmegerät & Telemetrie
            </Text>
            <Badge size="xs" variant="outline">
              {devType}
            </Badge>
          </Group>
          <Divider my={2} />

          {/* Device & OS */}
          <div>
            <Text size="xs" fw={600}>
              Gerät & System
            </Text>
            <Text size="xs" c="dimmed">
              {[
                devFamily,
                osName ? `${osName} ${parsed?.os_version || browser?.os_version || ''}`.trim() : null,
                dev?.platform,
              ]
                .filter(Boolean)
                .join(' · ') || 'Keine Systemangaben'}
            </Text>
            {dev?.screen_width && dev?.screen_height && (
              <Text size="xs" c="dimmed">
                Display: {dev.screen_width} × {dev.screen_height}
                {dev.device_pixel_ratio ? ` (@${dev.device_pixel_ratio}x)` : ''}
              </Text>
            )}
          </div>

          {/* Browser */}
          <div>
            <Text size="xs" fw={600}>
              Browser
            </Text>
            <Text size="xs" c="dimmed">
              {[
                browserName
                  ? `${browserName} ${parsed?.browser_version || browser?.version || ''}`.trim()
                  : null,
                browser?.language ? `Sprache: ${browser.language}` : null,
              ]
                .filter(Boolean)
                .join(' · ') || 'Unbekannt'}
            </Text>
          </div>

          {/* Microphone & Audio Settings */}
          <div>
            <Text size="xs" fw={600}>
              Mikrofon & Audio
            </Text>
            <Text size="xs" c="dimmed">
              {micLabel || 'Standard-Eingang'}
            </Text>
            <Group gap="xs" mt={2}>
              {mic?.sample_rate && (
                <Badge size="xs" variant="dot" color="blue">
                  {mic.sample_rate.toLocaleString()} Hz
                </Badge>
              )}
              {mic?.channel_count && (
                <Badge size="xs" variant="dot" color="teal">
                  {mic.channel_count === 1 ? 'Mono' : `${mic.channel_count} Kanäle`}
                </Badge>
              )}
              {fmt?.mime_type && (
                <Badge size="xs" variant="outline" color="gray">
                  {fmt.mime_type.split(';')[0]}
                </Badge>
              )}
            </Group>
            {(mic?.noise_suppression !== undefined || mic?.echo_cancellation !== undefined) && (
              <Text size="xs" c="dimmed" mt={2}>
                Filter:{' '}
                {[
                  mic.echo_cancellation !== undefined
                    ? `Echo: ${mic.echo_cancellation ? 'An' : 'Aus'}`
                    : null,
                  mic.noise_suppression !== undefined
                    ? `Denoise: ${mic.noise_suppression ? 'An' : 'Aus'}`
                    : null,
                  mic.auto_gain_control !== undefined
                    ? `AGC: ${mic.auto_gain_control ? 'An' : 'Aus'}`
                    : null,
                ]
                  .filter(Boolean)
                  .join(', ')}
              </Text>
            )}
          </div>
        </Stack>
      </HoverCard.Dropdown>
    </HoverCard>
  );
}
