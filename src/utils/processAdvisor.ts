import type { HardwareDomain, SystemProcessEntry } from '../types/hardware';

export type HardwareNeedLevel = 'required' | 'active-workload' | 'not-needed';

export type ProcessRecommendation = 'Let It Run' | 'End Process';

export interface ProcessAdvice {
  hardwareNeedLevel: HardwareNeedLevel;
  hardwareNeedsToRun: boolean;
  hardwareNeedTitle: string;
  hardwareNeedSummary: string;
  recommendation: ProcessRecommendation;
  recommendationBadge: 'Required' | 'Let Run' | 'Can End';
  recommendationReason: string;
  impactIfEnded: string;
  reclaimSummary: string;
  canEndProcess: boolean;
}

const CRITICAL_PATTERNS: Array<{
  pattern: RegExp;
  summary: string;
  reason: string;
  impact: string;
}> = [
  {
    pattern: /\b(dwm|dwm\.exe|windows desktop)\b/i,
    summary: 'Yes — Required by GPU & Windows display output.',
    reason:
      'Desktop Window Manager composites every window and frame buffer on your monitor. Your GPU and Windows 10/11 need this running at all times.',
    impact: 'Ending Desktop Window Manager blanks the screen and forces a display driver reset.',
  },
  {
    pattern: /\b(system|ntoskrnl|kernel|csrss|wininit|winlogon|lsass|services|smss|svchost|audiodg|nvlddmkm|amdwddmg|nvcontainer)\b/i,
    summary: 'Yes — Required by CPU, motherboard, and Windows kernel.',
    reason:
      'Core operating system or hardware driver service managing CPU scheduling, memory protection, or PCIe hardware links.',
    impact: 'Ending a critical kernel or driver process will cause a Windows stop error or hardware drop.',
  },
  {
    pattern: /\b(die hardware|diehardwareagent)\b/i,
    summary: 'Yes — Active hardware monitor & sensor bridge.',
    reason:
      'Powers your live Die Hardware dashboard, sensor stream, overclocking controls, and CSV logger.',
    impact: 'Ending this process closes Die Hardware and stops real-time sensor logging.',
  },
];

const ACTIVE_PIPELINE_PATTERNS: Array<{
  pattern: RegExp;
  summary: string;
  reason: string;
  impact: string;
}> = [
  {
    pattern: /\b(dlss|afmf|fsr|frame gen|optical flow|xess)\b/i,
    summary: 'No for boot — Needed only for active AI Frame Generation.',
    reason:
      'Your GPU hardware does not need this to stay healthy, but your running game uses it to double FPS via AI frame generation. Let it run while playing; end it only if stuck after exiting a game.',
    impact: 'Drops AI-generated frames back to native render FPS or resets the frame-gen worker.',
  },
  {
    pattern: /\b(game engine|dx12|vulkan|unreal|unity|cyberpunk|cod|valorant|fortnite|eldenring|starfield|baldur|helldivers|cs2)\b/i,
    summary: 'No — Your PC hardware does not need this, but it is your active 3D game.',
    reason:
      'Your CPU and GPU run fine without it, because this is a foreground 3D game/application. Let it run if you are actively playing, or end it now to immediately free GPU VRAM and CPU power.',
    impact: 'Closes the running 3D game immediately without saving unsaved progress.',
  },
];

const OPTIONAL_BACKGROUND_PATTERNS: Array<{
  pattern: RegExp;
  summary: string;
  reason: string;
  impact: string;
}> = [
  {
    pattern: /\b(obs64|obs|capture|shadowplay|nvshare|gamebar|xboxgamebar)\b/i,
    summary: 'No — Hardware does not need this background recorder.',
    reason:
      'Video capture and replay buffers reserve dedicated VRAM and GPU media encoders even when you are not streaming. Safe to end unless you are actively recording.',
    impact: 'Stops background video recording/instant replay and frees VRAM + GPU encoder load.',
  },
  {
    pattern: /\b(searchindexer|searchapp|wsearch|search indexer)\b/i,
    summary: 'No — Hardware does not need background file indexing.',
    reason:
      'Crawls your NVMe SSD and uses CPU threads to index files. Safe to end when gaming or benchmarking to eliminate disk read stutters.',
    impact: 'Pauses background file indexing; Windows restarts it automatically later when idle.',
  },
  {
    pattern: /\b(steamwebhelper|epicwebhelper|battle\.net|ea background|galaxyclient|discord|overlay)\b/i,
    summary: 'No — Hardware does not need launcher browser helpers.',
    reason:
      'Embedded Chromium launcher/overlay helper consuming RAM, CPU cycles, and GPU shared memory in the background.',
    impact: 'Closes the store/chat overlay window and frees RAM & CPU; active games keep running.',
  },
  {
    pattern: /\b(onedrive|dropbox|googledrive|cloud sync|wuauclt|tiworker|windows update)\b/i,
    summary: 'No — Hardware does not need background cloud sync or updater.',
    reason:
      'Uses network bandwidth, SSD write speed, and CPU cycles in the background. Ending it keeps ping low and storage queues clear.',
    impact: 'Pauses background cloud file transfers until you reopen the sync app.',
  },
];

export function formatReclaimSummary(proc: SystemProcessEntry): string {
  const parts: string[] = [];
  if (proc.vramMb > 0) parts.push(`${proc.vramMb.toLocaleString()} MB VRAM`);
  if (proc.cpuPct >= 0.5) parts.push(`${proc.cpuPct.toFixed(1)}% CPU`);
  if (proc.gpuPct >= 1) parts.push(`${proc.gpuPct}% GPU`);
  if (proc.ramMb >= 64) parts.push(`${proc.ramMb.toLocaleString()} MB RAM`);
  if (proc.diskMbps >= 1) parts.push(`${proc.diskMbps.toFixed(0)} MB/s Disk`);
  if (proc.netMbps >= 0.5) parts.push(`${proc.netMbps.toFixed(1)} Mbps Net`);
  return parts.length > 0 ? `Frees ${parts.join(' · ')}` : 'Minimal active hardware load';
}

export function analyzeProcess(
  proc: SystemProcessEntry,
  focusDomain?: HardwareDomain
): ProcessAdvice {
  const target = `${proc.processName} ${proc.exeName}`;
  const reclaimSummary = formatReclaimSummary(proc);
  const domainLabel = focusDomain ?? proc.domains[0] ?? 'System';

  if (proc.pid === 0 || proc.pid === 4 || proc.engineType === 'System') {
    return {
      hardwareNeedLevel: 'required',
      hardwareNeedsToRun: true,
      hardwareNeedTitle: `Yes — ${domainLabel} & Windows Need This`,
      hardwareNeedSummary: 'Core Windows kernel & hardware driver process.',
      recommendation: 'Let It Run',
      recommendationBadge: 'Required',
      recommendationReason:
        'Essential operating system process required to keep CPU cores, memory paging, and PCIe hardware stable.',
      impactIfEnded: 'Protected by Die Hardware — ending system processes destabilizes Windows.',
      reclaimSummary,
      canEndProcess: false,
    };
  }

  for (const rule of CRITICAL_PATTERNS) {
    if (rule.pattern.test(target)) {
      return {
        hardwareNeedLevel: 'required',
        hardwareNeedsToRun: true,
        hardwareNeedTitle: `Yes — ${domainLabel} Hardware Needs This`,
        hardwareNeedSummary: rule.summary,
        recommendation: 'Let It Run',
        recommendationBadge: 'Required',
        recommendationReason: rule.reason,
        impactIfEnded: rule.impact,
        reclaimSummary,
        canEndProcess: false,
      };
    }
  }

  for (const rule of ACTIVE_PIPELINE_PATTERNS) {
    if (rule.pattern.test(target)) {
      return {
        hardwareNeedLevel: 'active-workload',
        hardwareNeedsToRun: false,
        hardwareNeedTitle: `Not Required by Hardware (Active ${domainLabel} Workload)`,
        hardwareNeedSummary: rule.summary,
        recommendation: 'Let It Run',
        recommendationBadge: 'Let Run',
        recommendationReason: rule.reason,
        impactIfEnded: rule.impact,
        reclaimSummary,
        canEndProcess: true,
      };
    }
  }

  for (const rule of OPTIONAL_BACKGROUND_PATTERNS) {
    if (rule.pattern.test(target)) {
      return {
        hardwareNeedLevel: 'not-needed',
        hardwareNeedsToRun: false,
        hardwareNeedTitle: `No — ${domainLabel} Does Not Need This`,
        hardwareNeedSummary: rule.summary,
        recommendation: 'End Process',
        recommendationBadge: 'Can End',
        recommendationReason: rule.reason,
        impactIfEnded: rule.impact,
        reclaimSummary,
        canEndProcess: true,
      };
    }
  }

  // Fallback heuristic for arbitrary live Windows executables discovered via local agent
  const isHeavy3D = proc.engineType === '3D / AI' || proc.vramMb >= 2048 || proc.gpuPct >= 25;
  if (isHeavy3D) {
    return {
      hardwareNeedLevel: 'active-workload',
      hardwareNeedsToRun: false,
      hardwareNeedTitle: `Not Required by Hardware (Active ${domainLabel} App)`,
      hardwareNeedSummary:
        'Your hardware does not require this app, though it is actively rendering on the GPU/CPU.',
      recommendation: 'Let It Run',
      recommendationBadge: 'Let Run',
      recommendationReason:
        'Let it run if you are actively using this application, or click End Process if it is stuck or no longer needed.',
      impactIfEnded: 'Immediately terminates this application and releases its hardware allocation.',
      reclaimSummary,
      canEndProcess: true,
    };
  }

  return {
    hardwareNeedLevel: 'not-needed',
    hardwareNeedsToRun: false,
    hardwareNeedTitle: `No — ${domainLabel} Does Not Need This`,
    hardwareNeedSummary: 'Optional user or background program — not needed for hardware operation.',
    recommendation: 'End Process',
    recommendationBadge: 'Can End',
    recommendationReason:
      'Your CPU, GPU, and Windows OS do not depend on this background task. Safe to end if you want maximum headroom.',
    impactIfEnded: 'Closes this background program and returns its resources to free pool.',
    reclaimSummary,
    canEndProcess: true,
  };
}

export function getProcessesForDomain(
  processes: SystemProcessEntry[],
  domain: HardwareDomain,
  limit = 4
): SystemProcessEntry[] {
  const matching = processes.filter((p) => p.domains.includes(domain));
  const sorted = [...matching].sort((a, b) => {
    switch (domain) {
      case 'CPU':
        return b.cpuPct - a.cpuPct;
      case 'GPU':
        return b.gpuPct - a.gpuPct || b.vramMb - a.vramMb;
      case 'RAM':
        return b.vramMb + b.ramMb - (a.vramMb + a.ramMb);
      case 'Storage':
        return b.diskMbps - a.diskMbps;
      case 'Network':
        return b.netMbps - a.netMbps;
    }
  });
  return sorted.slice(0, limit);
}
