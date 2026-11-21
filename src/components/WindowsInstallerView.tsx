import React, { useMemo, useState } from 'react';
import { CheckCircle2, Download, FileCheck2, Loader2 } from 'lucide-react';
import { buildWindowsInstallerZip, generateInstallerFiles } from '../utils/windowsInstaller';

export const WindowsInstallerView: React.FC = () => {
  const [downloadedMessage, setDownloadedMessage] = useState<string | null>(null);
  const [isPackaging, setIsPackaging] = useState(false);
  const [showScriptPreview, setShowScriptPreview] = useState(false);

  const currentAppUrl =
    typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';

  const installerFiles = useMemo(
    () => generateInstallerFiles(currentAppUrl),
    [currentAppUrl]
  );

  const triggerBlobDownload = (blob: Blob) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'Die-Hardware-Setup.zip';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleDownloadZip = async () => {
    setIsPackaging(true);
    try {
      const response = await fetch('/api/installer-zip', {
        method: 'GET',
        cache: 'no-store',
      });
      const contentType = response.headers.get('content-type') || '';
      if (response.ok && contentType.includes('application/zip')) {
        const blob = await response.blob();
        triggerBlobDownload(blob);
      } else {
        const fallbackBytes = buildWindowsInstallerZip(currentAppUrl);
        triggerBlobDownload(
          new Blob([fallbackBytes.buffer as ArrayBuffer], { type: 'application/zip' })
        );
      }
      setDownloadedMessage(
        'Downloaded Die-Hardware-Setup.zip — Extract the folder and double-click "Install Die Hardware.cmd". It installs all components, minimizes itself, and opens Die Hardware on your screen.'
      );
    } catch {
      const fallbackBytes = buildWindowsInstallerZip(currentAppUrl);
      triggerBlobDownload(
        new Blob([fallbackBytes.buffer as ArrayBuffer], { type: 'application/zip' })
      );
      setDownloadedMessage(
        'Downloaded Die-Hardware-Setup.zip — Extract the folder and double-click "Install Die Hardware.cmd". It installs all components, minimizes itself, and opens Die Hardware on your screen.'
      );
    } finally {
      setIsPackaging(false);
    }
  };

  const singleFile = installerFiles[0];

  return (
    <div className="space-y-5">
      {/* Simple 1-File Standalone Package Hero */}
      <div className="grid grid-cols-1 gap-5 rounded-md border border-slate-800 bg-[#0D121D] p-6 lg:grid-cols-12">
        <div className="flex items-start gap-4 lg:col-span-8">
          <div className="h-20 w-20 shrink-0 overflow-hidden rounded-md border border-slate-700 bg-[#07090E]">
            <img
              src="/src/assets/images/die_hardware_emblem_1794847286676.jpg"
              alt="Die Hardware emblem"
              referrerPolicy="no-referrer"
              className="h-full w-full object-cover"
            />
          </div>
          <div>
            <h2 className="font-display text-lg font-semibold text-slate-100">
              Install Die Hardware on Windows 10 &amp; 11
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-slate-300">
              Downloads a standalone ZIP containing one single installer file (
              <span className="font-mono-tabular text-cyan-300">Install Die Hardware.cmd</span>
              ). Extract and double-click that one file — it installs the native{' '}
              <span className="font-mono-tabular text-slate-100">DieHardware.exe</span> desktop app
              and sensor engine, minimizes setup, and loads Die Hardware right on screen.
            </p>
            <div className="mt-3 grid grid-cols-1 gap-1.5 text-xs text-slate-300 sm:grid-cols-2">
              <div className="font-mono-tabular text-[11px] text-cyan-300">
                1. Works on double-click &amp; Command Prompt
              </div>
              <div className="font-mono-tabular text-[11px] text-cyan-300">
                2. Builds native DieHardware.exe + Desktop shortcut
              </div>
              <div className="font-mono-tabular text-[11px] text-cyan-300">
                3. Minimizes setup &amp; opens Chrome desktop window
              </div>
              <div className="font-mono-tabular text-[11px] text-cyan-300">
                4. Live 10Hz °F hardware stream &amp; Settings uninstaller
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col justify-center gap-2.5 lg:col-span-4 lg:items-end">
          <button
            type="button"
            onClick={handleDownloadZip}
            disabled={isPackaging}
            className="inline-flex w-full items-center justify-center gap-2 whitespace-nowrap rounded bg-amber-500 px-5 py-3 text-xs font-semibold text-slate-950 transition-colors hover:bg-amber-400 disabled:cursor-wait disabled:opacity-75 lg:w-auto"
          >
            {isPackaging ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Building Setup (.zip)...
              </>
            ) : (
              <>
                <Download className="h-4 w-4" />
                Download Setup (.zip)
              </>
            )}
          </button>
          <span className="font-mono-tabular text-[11px] text-slate-400">
            Contains 1 file: {singleFile.name}
          </span>
        </div>
      </div>

      {downloadedMessage && (
        <div className="flex items-center gap-2.5 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-xs text-emerald-200">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
          <span>{downloadedMessage}</span>
        </div>
      )}

      {/* Simple 3-Step Visual Guide + Optional Inspector */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-md border border-slate-800 bg-[#0D121D] p-4">
          <div className="font-mono-tabular text-xs font-semibold text-amber-400">STEP 1 · EXTRACT</div>
          <div className="mt-1 font-display text-sm font-semibold text-slate-100">
            Extract Die-Hardware-Setup.zip
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Right-click the downloaded ZIP in Windows Explorer and click Extract All. Inside is one installer file.
          </p>
        </div>

        <div className="rounded-md border border-slate-800 bg-[#0D121D] p-4">
          <div className="font-mono-tabular text-xs font-semibold text-cyan-400">STEP 2 · DOUBLE-CLICK</div>
          <div className="mt-1 font-display text-sm font-semibold text-slate-100">
            Run Install Die Hardware.cmd
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Double-click to install all required app files and shortcuts, minimize setup, and load Die Hardware on screen.
          </p>
        </div>

        <div className="rounded-md border border-slate-800 bg-[#0D121D] p-4">
          <div className="font-mono-tabular text-xs font-semibold text-emerald-400">STEP 3 · UNINSTALL</div>
          <div className="mt-1 font-display text-sm font-semibold text-slate-100">
            Standard Windows Uninstaller
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Launch anytime from your Desktop or Start Menu, or uninstall cleanly in Windows Settings → Apps → Die Hardware.
          </p>
        </div>
      </div>

      <div className="rounded-md border border-slate-800 bg-[#0D121D] p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-slate-300">
            <FileCheck2 className="h-4 w-4 text-cyan-400" />
            <span className="font-mono-tabular font-semibold">{singleFile.name}</span>
            <span className="text-slate-500">· Single self-contained Windows 10/11 installer</span>
          </div>
          <button
            type="button"
            onClick={() => setShowScriptPreview((prev) => !prev)}
            className="rounded border border-slate-700 bg-[#07090E] px-3 py-1 text-xs text-slate-300 hover:border-cyan-500"
          >
            {showScriptPreview ? 'Hide Installer Code' : 'Inspect Installer Code'}
          </button>
        </div>

        {showScriptPreview && (
          <pre className="mt-3 max-h-[340px] overflow-y-auto whitespace-pre-wrap break-all rounded border border-slate-800 bg-[#07090E] p-3 font-mono-tabular text-[11px] leading-relaxed text-slate-300">
            {singleFile.content}
          </pre>
        )}
      </div>
    </div>
  );
};
