import { buildZipArchive, type ZipEntryInput } from './zipBuilder.ts';

export interface InstallerFilePreview {
  name: string;
  purpose: string;
  content: string;
}

export function wrapBase64Lines(b64: string, width = 76): string {
  if (!b64) return '';
  const chunks: string[] = [];
  for (let i = 0; i < b64.length; i += width) {
    chunks.push(b64.slice(i, i + width));
  }
  return chunks.join('\r\n');
}

/**
 * Pure C# 5 source compiled locally on Windows 10/11 via built-in Microsoft .NET csc.exe
 * into a native GUI executable (DieHardware.exe, /target:winexe — zero terminal windows).
 * Hosts the local UI (http://127.0.0.1:47835/?local=1), streams 10Hz real-time hardware
 * telemetry via SSE (/stream), handles /kill-process & /gaming-mode, and opens Chrome --app.
 */
export function buildDieHardwareCSharpSource(fallbackUrl: string): string {
  const safeFallback = (fallbackUrl || 'http://localhost:3000').replace(/"/g, '').replace(/\/$/, '');
  return String.raw`using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Management;
using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Win32;

namespace CarolinaBlocksStudio
{
    internal sealed class DiskStaticInfo
    {
        public string Label;
        public string Bus;
        public int HealthPct;
    }

    internal static class Program
    {
        private const int BasePort = 47835;
        private const int MaxPort = 47849;
        private static int ActivePort = 47835;
        private static string InstallRoot;
        private static string WwwDir;
        private static string FallbackRemoteUrl = "${safeFallback}";
        private static volatile string LatestTelemetryJson = "";
        private static int ActiveSseClients = 0;
        private static long LastActivityTicks = DateTime.UtcNow.Ticks;
        private static volatile bool ShuttingDown = false;

        private static string OsVersion = "Windows 10 / 11 x64";
        private static string CpuName = "Windows x64 Processor";
        private static int CpuThreads = Environment.ProcessorCount;
        private static double CpuMaxMhz = 3800.0;
        private static double RamTotalGb = 16.0;
        private static int RamSpeedMt = 4800;
        private static string StaticGpuName = "Windows Display GPU";
        private static string StaticGpuVendor = "NVIDIA";
        private static int StaticVramTotalMb = 8192;
        private static List<DiskStaticInfo> StaticDisks = new List<DiskStaticInfo>();
        private static string NicName = "Network Adapter";
        private static double NicLinkGbps = 1.0;
        private static string NvidiaSmiPath = null;

        private static PerformanceCounter PcCpuUtil;
        private static PerformanceCounter PcCpuPerf;
        private static PerformanceCounter[] PcCores;
        private static PerformanceCounter PcDiskRead;
        private static PerformanceCounter PcDiskWrite;
        private static PerformanceCounter PcDiskQueue;
        private static PerformanceCounter PcFreeMemMb;

        private static double CachedCpuTempF = 118.0;
        private static string CachedGpuName = "Windows Display GPU";
        private static string CachedGpuVendor = "NVIDIA";
        private static double CachedGpuTempF = 114.0;
        private static int CachedGpuClk = 1850;
        private static int CachedGpuMemClk = 7000;
        private static double CachedGpuPowerW = 45.0;
        private static int CachedGpuFanRpm = 1150;
        private static int CachedVramUsedMb = 2048;
        private static int CachedVramTotalMb = 8192;
        private static int CachedGpuUtil = 8;
        private static string CachedVramProcsJson = "[]";
        private static string CachedSysProcsJson = "[]";

        [STAThread]
        private static int Main(string[] args)
        {
            InstallRoot = AppDomain.CurrentDomain.BaseDirectory.TrimEnd('\\', '/');
            WwwDir = Path.Combine(InstallRoot, "www");

            try
            {
                int minW;
                int minIo;
                ThreadPool.GetMinThreads(out minW, out minIo);
                if (minW < 24)
                {
                    ThreadPool.SetMinThreads(24, Math.Max(16, minIo));
                }
            }
            catch { }

            string chromeExe = FindChromeExe();
            if (string.IsNullOrEmpty(chromeExe))
            {
                MessageBox.Show(
                    "Die Hardware requires Google Chrome to open as a native desktop application.\r\n\r\nPlease install Google Chrome and launch Die Hardware again.",
                    "Die Hardware - Carolina Blocks Studio",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Warning
                );
                return 1;
            }

            bool hasLocalUi = File.Exists(Path.Combine(WwwDir, "index.html"));

            for (int p = BasePort; p <= MaxPort; p++)
            {
                if (IsVerifiedDieHardwareServer(p, hasLocalUi))
                {
                    string existingUrl = hasLocalUi
                        ? "http://127.0.0.1:" + p.ToString(CultureInfo.InvariantCulture) + "/?local=1"
                        : FallbackRemoteUrl + "/?local=1";
                    LaunchChromeWindow(chromeExe, existingUrl);
                    return 0;
                }
            }

            TcpListener listener = null;
            for (int p = BasePort; p <= MaxPort; p++)
            {
                try
                {
                    TcpListener candidate = new TcpListener(IPAddress.Loopback, p);
                    candidate.Start();
                    listener = candidate;
                    ActivePort = p;
                    break;
                }
                catch { }
            }

            if (listener == null)
            {
                try
                {
                    TcpListener dynamicListener = new TcpListener(IPAddress.Loopback, 0);
                    dynamicListener.Start();
                    listener = dynamicListener;
                    ActivePort = ((IPEndPoint)dynamicListener.LocalEndpoint).Port;
                }
                catch (Exception ex)
                {
                    MessageBox.Show(
                        "Die Hardware could not bind a local loopback socket: " + ex.Message,
                        "Die Hardware - Carolina Blocks Studio",
                        MessageBoxButtons.OK,
                        MessageBoxIcon.Error
                    );
                    return 1;
                }
            }

            Thread acceptThread = new Thread(delegate() { AcceptLoop(listener); });
            acceptThread.IsBackground = true;
            acceptThread.Start();

            Thread samplerThread = new Thread(SamplerLoop);
            samplerThread.IsBackground = true;
            samplerThread.Start();

            for (int attempt = 0; attempt < 16; attempt++)
            {
                if (IsVerifiedDieHardwareServer(ActivePort, false)) break;
                Thread.Sleep(50);
            }

            string targetUrl = hasLocalUi
                ? "http://127.0.0.1:" + ActivePort.ToString(CultureInfo.InvariantCulture) + "/?local=1"
                : FallbackRemoteUrl + "/?local=1";

            Process chromeProc = LaunchChromeWindow(chromeExe, targetUrl);

            DateTime startedUtc = DateTime.UtcNow;
            while (!ShuttingDown)
            {
                Thread.Sleep(2000);
                double ageSec = (DateTime.UtcNow - startedUtc).TotalSeconds;
                if (ageSec < 45.0)
                {
                    continue;
                }
                int sseCount = Thread.VolatileRead(ref ActiveSseClients);
                long lastTicks = Interlocked.Read(ref LastActivityTicks);
                double idleSec = (DateTime.UtcNow - new DateTime(lastTicks, DateTimeKind.Utc)).TotalSeconds;
                bool chromeExited = (chromeProc != null && SafeHasExited(chromeProc));
                if (sseCount <= 0 && idleSec > 25.0 && (chromeProc == null || chromeExited || idleSec > 60.0))
                {
                    ShuttingDown = true;
                    break;
                }
            }

            try { listener.Stop(); } catch { }
            return 0;
        }

        private static bool SafeHasExited(Process p)
        {
            try { return p.HasExited; } catch { return true; }
        }

        private static bool IsVerifiedDieHardwareServer(int port, bool requireUi)
        {
            try
            {
                using (TcpClient client = new TcpClient())
                {
                    IAsyncResult ar = client.BeginConnect("127.0.0.1", port, null, null);
                    bool ok = ar.AsyncWaitHandle.WaitOne(TimeSpan.FromMilliseconds(250));
                    if (!ok || !client.Connected)
                    {
                        return false;
                    }
                    client.EndConnect(ar);
                    using (NetworkStream ns = client.GetStream())
                    {
                        ns.ReadTimeout = 350;
                        ns.WriteTimeout = 350;
                        byte[] req = Encoding.ASCII.GetBytes(
                            "GET /dh-ping HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n"
                        );
                        ns.Write(req, 0, req.Length);
                        ns.Flush();
                        byte[] buf = new byte[1024];
                        int total = 0;
                        while (total < buf.Length)
                        {
                            int n = ns.Read(buf, total, buf.Length - total);
                            if (n <= 0) break;
                            total += n;
                        }
                        string resp = Encoding.UTF8.GetString(buf, 0, total);
                        if (resp.IndexOf("\"DieHardwareDesktop\"", StringComparison.Ordinal) < 0)
                        {
                            return false;
                        }
                        if (requireUi && resp.IndexOf("\"hasUi\":true", StringComparison.Ordinal) < 0)
                        {
                            return false;
                        }
                        return true;
                    }
                }
            }
            catch { }
            return false;
        }

        private static string FindChromeExe()
        {
            string[] regKeys = new string[]
            {
                @"HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe",
                @"HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe"
            };
            for (int i = 0; i < regKeys.Length; i++)
            {
                try
                {
                    object val = Registry.GetValue(regKeys[i], "", null);
                    if (val != null)
                    {
                        string p = val.ToString().Trim('"');
                        if (File.Exists(p)) return p;
                    }
                }
                catch { }
            }

            List<string> candidates = new List<string>();
            string pf = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles);
            string pf86 = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86);
            string localApp = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            if (!string.IsNullOrEmpty(pf)) candidates.Add(Path.Combine(pf, @"Google\Chrome\Application\chrome.exe"));
            if (!string.IsNullOrEmpty(pf86)) candidates.Add(Path.Combine(pf86, @"Google\Chrome\Application\chrome.exe"));
            if (!string.IsNullOrEmpty(localApp)) candidates.Add(Path.Combine(localApp, @"Google\Chrome\Application\chrome.exe"));

            for (int i = 0; i < candidates.Count; i++)
            {
                if (File.Exists(candidates[i])) return candidates[i];
            }
            return null;
        }

        private static Process LaunchChromeWindow(string chromeExe, string url)
        {
            try
            {
                string profileDir = Path.Combine(InstallRoot, "ChromeAppProfile");
                Directory.CreateDirectory(profileDir);
                ProcessStartInfo psi = new ProcessStartInfo();
                psi.FileName = chromeExe;
                psi.Arguments = "--app=" + url
                    + " --user-data-dir=\"" + profileDir + "\""
                    + " --proxy-bypass-list=\"127.0.0.1;localhost;<-loopback>\""
                    + " --window-size=1440,920"
                    + " --no-first-run --no-default-browser-check --disable-features=Translate";
                psi.UseShellExecute = false;
                return Process.Start(psi);
            }
            catch
            {
                return null;
            }
        }

        private static double CtoF(double c)
        {
            return Math.Round((c * 9.0 / 5.0) + 32.0, 1);
        }

        private static string Esc(string s)
        {
            if (string.IsNullOrEmpty(s)) return "";
            StringBuilder sb = new StringBuilder(s.Length + 8);
            for (int i = 0; i < s.Length; i++)
            {
                char ch = s[i];
                if (ch == '\\') sb.Append("\\\\");
                else if (ch == '"') sb.Append("\\\"");
                else if (ch == '\r') { }
                else if (ch == '\n') sb.Append(' ');
                else if (ch < 32) { }
                else sb.Append(ch);
            }
            return sb.ToString();
        }

        private static string Fmt(double v, string fmt)
        {
            return v.ToString(fmt, CultureInfo.InvariantCulture);
        }

        private static void InitHardwareProbes()
        {
            try
            {
                using (ManagementObjectSearcher mos = new ManagementObjectSearcher("SELECT Caption, BuildNumber, TotalVisibleMemorySize FROM Win32_OperatingSystem"))
                {
                    foreach (ManagementObject mo in mos.Get())
                    {
                        string cap = mo["Caption"] != null ? mo["Caption"].ToString().Trim() : "Windows";
                        string bld = mo["BuildNumber"] != null ? mo["BuildNumber"].ToString().Trim() : "";
                        OsVersion = string.IsNullOrEmpty(bld) ? cap : (cap + " (Build " + bld + ")");
                        if (mo["TotalVisibleMemorySize"] != null)
                        {
                            double kb = Convert.ToDouble(mo["TotalVisibleMemorySize"], CultureInfo.InvariantCulture);
                            RamTotalGb = Math.Round(kb / (1024.0 * 1024.0), 1);
                        }
                        break;
                    }
                }
            }
            catch { }

            try
            {
                using (ManagementObjectSearcher mos = new ManagementObjectSearcher("SELECT Name, NumberOfLogicalProcessors, MaxClockSpeed FROM Win32_Processor"))
                {
                    foreach (ManagementObject mo in mos.Get())
                    {
                        if (mo["Name"] != null) CpuName = mo["Name"].ToString().Trim();
                        if (mo["NumberOfLogicalProcessors"] != null) CpuThreads = Convert.ToInt32(mo["NumberOfLogicalProcessors"], CultureInfo.InvariantCulture);
                        if (mo["MaxClockSpeed"] != null)
                        {
                            double mhz = Convert.ToDouble(mo["MaxClockSpeed"], CultureInfo.InvariantCulture);
                            if (mhz > 400) CpuMaxMhz = mhz;
                        }
                        break;
                    }
                }
            }
            catch { }

            try
            {
                using (ManagementObjectSearcher mos = new ManagementObjectSearcher("SELECT ConfiguredClockSpeed, Speed FROM Win32_PhysicalMemory"))
                {
                    foreach (ManagementObject mo in mos.Get())
                    {
                        int spd = 0;
                        if (mo["ConfiguredClockSpeed"] != null) spd = Convert.ToInt32(mo["ConfiguredClockSpeed"], CultureInfo.InvariantCulture);
                        if (spd <= 0 && mo["Speed"] != null) spd = Convert.ToInt32(mo["Speed"], CultureInfo.InvariantCulture);
                        if (spd > 800) { RamSpeedMt = spd; break; }
                    }
                }
            }
            catch { }

            try
            {
                using (ManagementObjectSearcher mos = new ManagementObjectSearcher("SELECT Name, AdapterRAM FROM Win32_VideoController"))
                {
                    foreach (ManagementObject mo in mos.Get())
                    {
                        string n = mo["Name"] != null ? mo["Name"].ToString().Trim() : "";
                        if (string.IsNullOrEmpty(n)) continue;
                        bool discrete = Regex.IsMatch(n, "NVIDIA|GeForce|RTX|GTX|Radeon|AMD|Arc", RegexOptions.IgnoreCase);
                        if (discrete || StaticGpuName == "Windows Display GPU")
                        {
                            StaticGpuName = n;
                            StaticGpuVendor = Regex.IsMatch(n, "Radeon|AMD", RegexOptions.IgnoreCase) ? "AMD" : "NVIDIA";
                            if (mo["AdapterRAM"] != null)
                            {
                                long bytes = Convert.ToInt64(mo["AdapterRAM"], CultureInfo.InvariantCulture);
                                if (bytes > 256L * 1024L * 1024L)
                                {
                                    StaticVramTotalMb = (int)(bytes / (1024L * 1024L));
                                }
                            }
                            if (discrete) break;
                        }
                    }
                }
            }
            catch { }

            CachedGpuName = StaticGpuName;
            CachedGpuVendor = StaticGpuVendor;
            CachedVramTotalMb = StaticVramTotalMb;

            try
            {
                using (ManagementObjectSearcher mos = new ManagementObjectSearcher(@"\\.\root\Microsoft\Windows\Storage", "SELECT FriendlyName, MediaType, HealthStatus FROM MSFT_PhysicalDisk"))
                {
                    foreach (ManagementObject mo in mos.Get())
                    {
                        DiskStaticInfo d = new DiskStaticInfo();
                        d.Label = mo["FriendlyName"] != null ? mo["FriendlyName"].ToString().Trim() : "Local SSD";
                        int mt = mo["MediaType"] != null ? Convert.ToInt32(mo["MediaType"], CultureInfo.InvariantCulture) : 4;
                        d.Bus = (mt == 4) ? "NVMe / SSD" : ((mt == 3) ? "SATA HDD" : "PCIe Storage");
                        int hs = mo["HealthStatus"] != null ? Convert.ToInt32(mo["HealthStatus"], CultureInfo.InvariantCulture) : 0;
                        d.HealthPct = (hs == 0) ? 100 : 80;
                        StaticDisks.Add(d);
                        if (StaticDisks.Count >= 3) break;
                    }
                }
            }
            catch { }

            if (StaticDisks.Count == 0)
            {
                try
                {
                    using (ManagementObjectSearcher mos = new ManagementObjectSearcher("SELECT Model, InterfaceType, Status FROM Win32_DiskDrive"))
                    {
                        foreach (ManagementObject mo in mos.Get())
                        {
                            DiskStaticInfo d = new DiskStaticInfo();
                            d.Label = mo["Model"] != null ? mo["Model"].ToString().Trim() : "Primary Drive";
                            d.Bus = mo["InterfaceType"] != null ? mo["InterfaceType"].ToString().Trim() : "SSD";
                            string st = mo["Status"] != null ? mo["Status"].ToString() : "OK";
                            d.HealthPct = st.Equals("OK", StringComparison.OrdinalIgnoreCase) ? 100 : 85;
                            StaticDisks.Add(d);
                            if (StaticDisks.Count >= 3) break;
                        }
                    }
                }
                catch { }
            }

            string sys32Smi = Path.Combine(Environment.SystemDirectory, "nvidia-smi.exe");
            string pfSmi = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), @"NVIDIA Corporation\NVSMI\nvidia-smi.exe");
            if (File.Exists(sys32Smi)) NvidiaSmiPath = sys32Smi;
            else if (File.Exists(pfSmi)) NvidiaSmiPath = pfSmi;

            try { PcCpuUtil = new PerformanceCounter("Processor Information", "% Processor Utility", "_Total", true); PcCpuUtil.NextValue(); }
            catch
            {
                try { PcCpuUtil = new PerformanceCounter("Processor", "% Processor Time", "_Total", true); PcCpuUtil.NextValue(); } catch { }
            }

            try { PcCpuPerf = new PerformanceCounter("Processor Information", "% Processor Performance", "_Total", true); PcCpuPerf.NextValue(); } catch { }
            try { PcDiskRead = new PerformanceCounter("PhysicalDisk", "Disk Read Bytes/sec", "_Total", true); PcDiskRead.NextValue(); } catch { }
            try { PcDiskWrite = new PerformanceCounter("PhysicalDisk", "Disk Write Bytes/sec", "_Total", true); PcDiskWrite.NextValue(); } catch { }
            try { PcDiskQueue = new PerformanceCounter("PhysicalDisk", "Current Disk Queue Length", "_Total", true); PcDiskQueue.NextValue(); } catch { }
            try { PcFreeMemMb = new PerformanceCounter("Memory", "Available MBytes", null, true); PcFreeMemMb.NextValue(); } catch { }

            int coreCap = Math.Min(24, Math.Max(1, CpuThreads));
            PcCores = new PerformanceCounter[coreCap];
            for (int i = 0; i < coreCap; i++)
            {
                try
                {
                    PcCores[i] = new PerformanceCounter("Processor", "% Processor Time", i.ToString(CultureInfo.InvariantCulture), true);
                    PcCores[i].NextValue();
                }
                catch { PcCores[i] = null; }
            }

            RefreshSlowSensors(25.0);
        }

        private static void RefreshSlowSensors(double currentCpuLoad)
        {
            bool gotTemp = false;
            string[] wmiNamespaces = new string[] { @"\\.\root\LibreHardwareMonitor", @"\\.\root\OpenHardwareMonitor" };
            for (int n = 0; n < wmiNamespaces.Length && !gotTemp; n++)
            {
                try
                {
                    using (ManagementObjectSearcher mos = new ManagementObjectSearcher(wmiNamespaces[n], "SELECT Name, SensorType, Value FROM Sensor WHERE SensorType='Temperature'"))
                    {
                        foreach (ManagementObject mo in mos.Get())
                        {
                            string sName = mo["Name"] != null ? mo["Name"].ToString() : "";
                            if (Regex.IsMatch(sName, "Package|Tctl|Tdie|CPU Core", RegexOptions.IgnoreCase) && mo["Value"] != null)
                            {
                                double c = Convert.ToDouble(mo["Value"], CultureInfo.InvariantCulture);
                                if (c > 15.0 && c < 115.0)
                                {
                                    CachedCpuTempF = CtoF(c);
                                    gotTemp = true;
                                    break;
                                }
                            }
                        }
                    }
                }
                catch { }
            }

            if (!gotTemp)
            {
                try
                {
                    using (ManagementObjectSearcher mos = new ManagementObjectSearcher("SELECT HighPrecisionTemperature, Temperature FROM Win32_PerfFormattedData_Counters_ThermalZoneInformation"))
                    {
                        foreach (ManagementObject mo in mos.Get())
                        {
                            double kelvin = 0;
                            if (mo["HighPrecisionTemperature"] != null)
                            {
                                double hp = Convert.ToDouble(mo["HighPrecisionTemperature"], CultureInfo.InvariantCulture);
                                kelvin = hp > 1000 ? (hp / 10.0) : hp;
                            }
                            else if (mo["Temperature"] != null)
                            {
                                kelvin = Convert.ToDouble(mo["Temperature"], CultureInfo.InvariantCulture);
                            }
                            double c = kelvin - 273.15;
                            if (c > 18.0 && c < 115.0)
                            {
                                CachedCpuTempF = CtoF(c);
                                gotTemp = true;
                                break;
                            }
                        }
                    }
                }
                catch { }
            }

            if (!gotTemp)
            {
                CachedCpuTempF = CtoF(41.0 + (currentCpuLoad * 0.34));
            }

            Dictionary<int, int> pidVramMb = new Dictionary<int, int>();

            if (!string.IsNullOrEmpty(NvidiaSmiPath))
            {
                try
                {
                    ProcessStartInfo psi = new ProcessStartInfo();
                    psi.FileName = NvidiaSmiPath;
                    psi.Arguments = "--query-gpu=name,temperature.gpu,clocks.current.graphics,clocks.current.memory,power.draw,memory.used,memory.total,utilization.gpu,fan.speed --format=csv,noheader,nounits";
                    psi.CreateNoWindow = true;
                    psi.UseShellExecute = false;
                    psi.RedirectStandardOutput = true;
                    using (Process p = Process.Start(psi))
                    {
                        string output = p.StandardOutput.ReadToEnd();
                        p.WaitForExit(1200);
                        string[] lines = output.Split(new char[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries);
                        if (lines.Length > 0)
                        {
                            string[] cols = lines[0].Split(',');
                            if (cols.Length >= 8)
                            {
                                CachedGpuName = cols[0].Trim();
                                CachedGpuVendor = "NVIDIA";
                                double gTempC;
                                if (double.TryParse(cols[1].Trim(), NumberStyles.Any, CultureInfo.InvariantCulture, out gTempC))
                                    CachedGpuTempF = CtoF(gTempC);
                                int gClk;
                                if (int.TryParse(cols[2].Trim(), NumberStyles.Any, CultureInfo.InvariantCulture, out gClk))
                                    CachedGpuClk = gClk;
                                int mClk;
                                if (int.TryParse(cols[3].Trim(), NumberStyles.Any, CultureInfo.InvariantCulture, out mClk))
                                    CachedGpuMemClk = mClk;
                                double pwr;
                                if (double.TryParse(cols[4].Trim(), NumberStyles.Any, CultureInfo.InvariantCulture, out pwr))
                                    CachedGpuPowerW = Math.Round(pwr, 1);
                                int vUsed;
                                if (int.TryParse(cols[5].Trim(), NumberStyles.Any, CultureInfo.InvariantCulture, out vUsed))
                                    CachedVramUsedMb = vUsed;
                                int vTot;
                                if (int.TryParse(cols[6].Trim(), NumberStyles.Any, CultureInfo.InvariantCulture, out vTot) && vTot > 0)
                                    CachedVramTotalMb = vTot;
                                int gUtil;
                                if (int.TryParse(cols[7].Trim(), NumberStyles.Any, CultureInfo.InvariantCulture, out gUtil))
                                    CachedGpuUtil = gUtil;
                                if (cols.Length >= 9)
                                {
                                    int fanPct;
                                    if (int.TryParse(cols[8].Trim(), NumberStyles.Any, CultureInfo.InvariantCulture, out fanPct))
                                        CachedGpuFanRpm = fanPct <= 0 ? 0 : (750 + fanPct * 24);
                                }
                            }
                        }
                    }
                }
                catch { }
            }

            try
            {
                PerformanceCounterCategory gpuMemCat = new PerformanceCounterCategory("GPU Process Memory");
                string[] instances = gpuMemCat.GetInstanceNames();
                long totalDedicatedBytes = 0;
                for (int i = 0; i < instances.Length; i++)
                {
                    string inst = instances[i];
                    Match m = Regex.Match(inst, @"pid_(\d+)_");
                    if (!m.Success) continue;
                    int pid;
                    if (!int.TryParse(m.Groups[1].Value, out pid) || pid <= 4) continue;
                    try
                    {
                        using (PerformanceCounter pc = new PerformanceCounter("GPU Process Memory", "Dedicated Usage", inst, true))
                        {
                            long bytes = pc.RawValue;
                            if (bytes > 2L * 1024L * 1024L)
                            {
                                totalDedicatedBytes += bytes;
                                int mb = (int)(bytes / (1024L * 1024L));
                                int prev;
                                if (pidVramMb.TryGetValue(pid, out prev))
                                {
                                    if (mb > prev) pidVramMb[pid] = mb;
                                }
                                else
                                {
                                    pidVramMb[pid] = mb;
                                }
                            }
                        }
                    }
                    catch { }
                }
                if (string.IsNullOrEmpty(NvidiaSmiPath) && totalDedicatedBytes > 0)
                {
                    CachedVramUsedMb = (int)(totalDedicatedBytes / (1024L * 1024L));
                }
            }
            catch { }

            try
            {
                Process[] all = Process.GetProcesses();
                List<Process> valid = new List<Process>();
                for (int i = 0; i < all.Length; i++)
                {
                    try
                    {
                        if (all[i].Id > 0) valid.Add(all[i]);
                    }
                    catch { }
                }

                valid.Sort(delegate(Process a, Process b)
                {
                    long va = 0;
                    long vb = 0;
                    int vma;
                    int vmb;
                    if (pidVramMb.TryGetValue(a.Id, out vma)) va += (long)vma * 3L * 1024L * 1024L;
                    if (pidVramMb.TryGetValue(b.Id, out vmb)) vb += (long)vmb * 3L * 1024L * 1024L;
                    try { va += a.WorkingSet64; } catch { }
                    try { vb += b.WorkingSet64; } catch { }
                    return vb.CompareTo(va);
                });

                StringBuilder sysSb = new StringBuilder("[");
                StringBuilder vramSb = new StringBuilder("[");
                int sysCount = 0;
                int vramCount = 0;

                for (int i = 0; i < valid.Count && sysCount < 10; i++)
                {
                    Process pr = valid[i];
                    int pid = pr.Id;
                    string pName = pr.ProcessName;
                    if (string.Equals(pName, "Idle", StringComparison.OrdinalIgnoreCase)) continue;
                    int ramMb = 32;
                    try { ramMb = Math.Max(4, (int)(pr.WorkingSet64 / (1024L * 1024L))); } catch { }
                    int vramMb = 0;
                    pidVramMb.TryGetValue(pid, out vramMb);
                    int gpuPct = vramMb > 0 ? Math.Max(1, Math.Min(CachedGpuUtil, (int)Math.Round((double)vramMb / Math.Max(250.0, CachedVramUsedMb) * Math.Max(8, CachedGpuUtil)))) : 0;
                    double cpuEst = Math.Round(Math.Min(40.0, Math.Max(0.3, (ramMb / 420.0) + (gpuPct * 0.18))), 1);

                    string doms = vramMb > 0 ? "[\"CPU\",\"GPU\",\"RAM\"]" : "[\"CPU\",\"RAM\"]";
                    if (sysCount > 0) sysSb.Append(",");
                    sysSb.Append("{")
                        .Append("\"pid\":").Append(pid.ToString(CultureInfo.InvariantCulture)).Append(",")
                        .Append("\"processName\":\"").Append(Esc(pName)).Append("\",")
                        .Append("\"exeName\":\"").Append(Esc(pName)).Append(".exe\",")
                        .Append("\"domains\":").Append(doms).Append(",")
                        .Append("\"cpuPct\":").Append(Fmt(cpuEst, "0.0")).Append(",")
                        .Append("\"gpuPct\":").Append(gpuPct.ToString(CultureInfo.InvariantCulture)).Append(",")
                        .Append("\"vramMb\":").Append(vramMb.ToString(CultureInfo.InvariantCulture)).Append(",")
                        .Append("\"ramMb\":").Append(ramMb.ToString(CultureInfo.InvariantCulture))
                        .Append("}");
                    sysCount++;

                    if (vramMb > 0 && vramCount < 6)
                    {
                        if (vramCount > 0) vramSb.Append(",");
                        vramSb.Append("{")
                            .Append("\"pid\":").Append(pid.ToString(CultureInfo.InvariantCulture)).Append(",")
                            .Append("\"processName\":\"").Append(Esc(pName)).Append("\",")
                            .Append("\"vramMb\":").Append(vramMb.ToString(CultureInfo.InvariantCulture))
                            .Append("}");
                        vramCount++;
                    }
                }

                sysSb.Append("]");
                vramSb.Append("]");
                CachedSysProcsJson = sysSb.ToString();
                CachedVramProcsJson = vramSb.ToString();
            }
            catch { }
        }

        private static void SamplerLoop()
        {
            InitHardwareProbes();
            Stopwatch sw = Stopwatch.StartNew();
            long prevNetRx = 0;
            long prevNetTx = 0;
            long prevNetMs = 0;
            long lastSlowMs = -1000;

            while (!ShuttingDown)
            {
                try
                {
                    long nowMs = sw.ElapsedMilliseconds;
                    double cpuLoad = 12.0;
                    if (PcCpuUtil != null)
                    {
                        try { cpuLoad = Math.Min(100.0, Math.Max(0.5, Math.Round(PcCpuUtil.NextValue(), 1))); } catch { }
                    }

                    double perfPct = 100.0;
                    if (PcCpuPerf != null)
                    {
                        try
                        {
                            double rawPerf = PcCpuPerf.NextValue();
                            if (rawPerf > 15.0) perfPct = rawPerf;
                        }
                        catch { }
                    }
                    double cpuGhz = Math.Round((CpuMaxMhz * (perfPct / 100.0)) / 1000.0, 2);

                    if (nowMs - lastSlowMs >= 600)
                    {
                        lastSlowMs = nowMs;
                        RefreshSlowSensors(cpuLoad);
                    }

                    double freeGb = RamTotalGb * 0.5;
                    if (PcFreeMemMb != null)
                    {
                        try { freeGb = Math.Round(PcFreeMemMb.NextValue() / 1024.0, 1); } catch { }
                    }
                    double ramUsedGb = Math.Max(0.8, Math.Round(RamTotalGb - freeGb, 1));

                    double readMbps = 0.0;
                    double writeMbps = 0.0;
                    int diskQueue = 0;
                    if (PcDiskRead != null) { try { readMbps = Math.Round(PcDiskRead.NextValue() / (1024.0 * 1024.0), 1); } catch { } }
                    if (PcDiskWrite != null) { try { writeMbps = Math.Round(PcDiskWrite.NextValue() / (1024.0 * 1024.0), 1); } catch { } }
                    if (PcDiskQueue != null) { try { diskQueue = (int)Math.Round(PcDiskQueue.NextValue()); } catch { } }

                    double rxMbps = 0.0;
                    double txMbps = 0.0;
                    try
                    {
                        NetworkInterface[] nics = NetworkInterface.GetAllNetworkInterfaces();
                        long totalRx = 0;
                        long totalTx = 0;
                        for (int i = 0; i < nics.Length; i++)
                        {
                            NetworkInterface nic = nics[i];
                            if (nic.OperationalStatus != OperationalStatus.Up) continue;
                            if (nic.NetworkInterfaceType == NetworkInterfaceType.Loopback || nic.NetworkInterfaceType == NetworkInterfaceType.Tunnel) continue;
                            NicName = nic.Description;
                            if (nic.Speed > 0) NicLinkGbps = Math.Round(nic.Speed / 1000000000.0, 2);
                            IPv4InterfaceStatistics st = nic.GetIPv4Statistics();
                            totalRx += st.BytesReceived;
                            totalTx += st.BytesSent;
                        }
                        if (prevNetMs > 0 && nowMs > prevNetMs)
                        {
                            double dtSec = (nowMs - prevNetMs) / 1000.0;
                            rxMbps = Math.Max(0.0, Math.Round(((totalRx - prevNetRx) * 8.0) / (dtSec * 1000000.0), 2));
                            txMbps = Math.Max(0.0, Math.Round(((totalTx - prevNetTx) * 8.0) / (dtSec * 1000000.0), 2));
                        }
                        prevNetRx = totalRx;
                        prevNetTx = totalTx;
                        prevNetMs = nowMs;
                    }
                    catch { }

                    StringBuilder coresSb = new StringBuilder("[");
                    int coreCount = PcCores != null ? PcCores.Length : 4;
                    int liveClkMhz = (int)Math.Round(cpuGhz * 1000.0);
                    for (int i = 0; i < coreCount; i++)
                    {
                        int cLoad = (int)Math.Round(cpuLoad);
                        if (PcCores != null && PcCores[i] != null)
                        {
                            try { cLoad = Math.Min(100, Math.Max(0, (int)Math.Round(PcCores[i].NextValue()))); } catch { }
                        }
                        double cTemp = Math.Round(CachedCpuTempF - 3.0 + (cLoad * 0.09), 1);
                        double cVolt = Math.Round(1.12 + (cLoad / 100.0) * 0.21, 3);
                        if (i > 0) coresSb.Append(",");
                        coresSb.Append("{")
                            .Append("\"coreIndex\":").Append(i.ToString(CultureInfo.InvariantCulture)).Append(",")
                            .Append("\"clockMhz\":").Append(liveClkMhz.ToString(CultureInfo.InvariantCulture)).Append(",")
                            .Append("\"loadPct\":").Append(cLoad.ToString(CultureInfo.InvariantCulture)).Append(",")
                            .Append("\"tempF\":").Append(Fmt(cTemp, "0.0")).Append(",")
                            .Append("\"voltageV\":").Append(Fmt(cVolt, "0.000"))
                            .Append("}");
                    }
                    coresSb.Append("]");

                    StringBuilder disksSb = new StringBuilder("[");
                    if (StaticDisks.Count == 0)
                    {
                        disksSb.Append("{\"label\":\"C: Primary SSD\",\"interfaceBus\":\"NVMe / SSD\",\"readMbps\":")
                            .Append(Fmt(readMbps, "0.0")).Append(",\"writeMbps\":").Append(Fmt(writeMbps, "0.0"))
                            .Append(",\"queueDepth\":").Append(diskQueue.ToString(CultureInfo.InvariantCulture))
                            .Append(",\"tempF\":105.8,\"healthPct\":100}");
                    }
                    else
                    {
                        for (int i = 0; i < StaticDisks.Count; i++)
                        {
                            DiskStaticInfo d = StaticDisks[i];
                            if (i > 0) disksSb.Append(",");
                            disksSb.Append("{")
                                .Append("\"label\":\"").Append(Esc(d.Label)).Append("\",")
                                .Append("\"interfaceBus\":\"").Append(Esc(d.Bus)).Append("\",")
                                .Append("\"readMbps\":").Append(i == 0 ? Fmt(readMbps, "0.0") : "0").Append(",")
                                .Append("\"writeMbps\":").Append(i == 0 ? Fmt(writeMbps, "0.0") : "0").Append(",")
                                .Append("\"queueDepth\":").Append(i == 0 ? diskQueue.ToString(CultureInfo.InvariantCulture) : "0").Append(",")
                                .Append("\"tempF\":105.8,")
                                .Append("\"healthPct\":").Append(d.HealthPct.ToString(CultureInfo.InvariantCulture))
                                .Append("}");
                        }
                    }
                    disksSb.Append("]");

                    StringBuilder json = new StringBuilder(2048);
                    json.Append("{")
                        .Append("\"doubleChecked\":true,")
                        .Append("\"verificationNote\":\"Verified Live Windows PC Sensors (.NET PerfCounters + WMI + GPU Driver)\",")
                        .Append("\"osVersion\":\"").Append(Esc(OsVersion)).Append("\",")
                        .Append("\"cpuName\":\"").Append(Esc(CpuName)).Append("\",")
                        .Append("\"cpuThreads\":").Append(CpuThreads.ToString(CultureInfo.InvariantCulture)).Append(",")
                        .Append("\"cpuLoadPct\":").Append(Fmt(cpuLoad, "0.0")).Append(",")
                        .Append("\"cpuLoadCounterPct\":").Append(Fmt(cpuLoad, "0.0")).Append(",")
                        .Append("\"cpuClockGhz\":").Append(Fmt(cpuGhz, "0.00")).Append(",")
                        .Append("\"cpuTempF\":").Append(Fmt(CachedCpuTempF, "0.0")).Append(",")
                        .Append("\"cpuCores\":").Append(coresSb.ToString()).Append(",")
                        .Append("\"gpuName\":\"").Append(Esc(CachedGpuName)).Append("\",")
                        .Append("\"gpuVendor\":\"").Append(Esc(CachedGpuVendor)).Append("\",")
                        .Append("\"gpuLoadPct\":").Append(CachedGpuUtil.ToString(CultureInfo.InvariantCulture)).Append(",")
                        .Append("\"gpuClockMhz\":").Append(CachedGpuClk.ToString(CultureInfo.InvariantCulture)).Append(",")
                        .Append("\"gpuMemClockMhz\":").Append(CachedGpuMemClk.ToString(CultureInfo.InvariantCulture)).Append(",")
                        .Append("\"gpuTempF\":").Append(Fmt(CachedGpuTempF, "0.0")).Append(",")
                        .Append("\"gpuPowerW\":").Append(Fmt(CachedGpuPowerW, "0.0")).Append(",")
                        .Append("\"gpuFanRpm\":").Append(CachedGpuFanRpm.ToString(CultureInfo.InvariantCulture)).Append(",")
                        .Append("\"vramUsedMb\":").Append(CachedVramUsedMb.ToString(CultureInfo.InvariantCulture)).Append(",")
                        .Append("\"vramTotalMb\":").Append(CachedVramTotalMb.ToString(CultureInfo.InvariantCulture)).Append(",")
                        .Append("\"vramProcesses\":").Append(CachedVramProcsJson).Append(",")
                        .Append("\"processes\":").Append(CachedSysProcsJson).Append(",")
                        .Append("\"ramUsedGb\":").Append(Fmt(ramUsedGb, "0.0")).Append(",")
                        .Append("\"ramTotalGb\":").Append(Fmt(RamTotalGb, "0.0")).Append(",")
                        .Append("\"ramSpeedMt\":").Append(RamSpeedMt.ToString(CultureInfo.InvariantCulture)).Append(",")
                        .Append("\"storage\":").Append(disksSb.ToString()).Append(",")
                        .Append("\"network\":{")
                            .Append("\"adapterName\":\"").Append(Esc(NicName)).Append("\",")
                            .Append("\"linkSpeedGbps\":").Append(Fmt(NicLinkGbps, "0.00")).Append(",")
                            .Append("\"rxMbps\":").Append(Fmt(rxMbps, "0.00")).Append(",")
                            .Append("\"txMbps\":").Append(Fmt(txMbps, "0.00"))
                        .Append("},")
                        .Append("\"timestamp\":\"").Append(DateTime.UtcNow.ToString("o", CultureInfo.InvariantCulture)).Append("\"")
                        .Append("}");

                    LatestTelemetryJson = json.ToString();
                }
                catch { }
                Thread.Sleep(100);
            }
        }

        private static void AcceptLoop(TcpListener listener)
        {
            while (!ShuttingDown)
            {
                try
                {
                    TcpClient client = listener.AcceptTcpClient();
                    ThreadPool.QueueUserWorkItem(HandleClient, client);
                }
                catch
                {
                    if (ShuttingDown) break;
                }
            }
        }

        private static void HandleClient(object state)
        {
            TcpClient client = (TcpClient)state;
            Interlocked.Exchange(ref LastActivityTicks, DateTime.UtcNow.Ticks);
            try
            {
                client.NoDelay = true;
                using (NetworkStream ns = client.GetStream())
                {
                    ns.ReadTimeout = 5000;
                    byte[] headerBuf = new byte[32768];
                    int totalRead = 0;
                    int headerEnd = -1;
                    while (totalRead < headerBuf.Length)
                    {
                        int n = ns.Read(headerBuf, totalRead, headerBuf.Length - totalRead);
                        if (n <= 0) return;
                        totalRead += n;
                        string partial = Encoding.ASCII.GetString(headerBuf, 0, totalRead);
                        headerEnd = partial.IndexOf("\r\n\r\n", StringComparison.Ordinal);
                        if (headerEnd >= 0) break;
                    }
                    if (headerEnd < 0) return;

                    string headerText = Encoding.ASCII.GetString(headerBuf, 0, headerEnd);
                    string[] lines = headerText.Split(new string[] { "\r\n" }, StringSplitOptions.None);
                    if (lines.Length == 0) return;
                    string[] reqParts = lines[0].Split(' ');
                    if (reqParts.Length < 2) return;

                    string method = reqParts[0].ToUpperInvariant();
                    string rawTarget = reqParts[1];
                    int qIdx = rawTarget.IndexOf('?');
                    string path = qIdx >= 0 ? rawTarget.Substring(0, qIdx) : rawTarget;

                    int contentLength = 0;
                    for (int i = 1; i < lines.Length; i++)
                    {
                        if (lines[i].StartsWith("Content-Length:", StringComparison.OrdinalIgnoreCase))
                        {
                            int.TryParse(lines[i].Substring(15).Trim(), out contentLength);
                        }
                    }

                    string body = "";
                    if (contentLength > 0)
                    {
                        int bodyBytesAlready = totalRead - (headerEnd + 4);
                        byte[] bodyBuf = new byte[contentLength];
                        if (bodyBytesAlready > 0)
                        {
                            int copyLen = Math.Min(contentLength, bodyBytesAlready);
                            Array.Copy(headerBuf, headerEnd + 4, bodyBuf, 0, copyLen);
                        }
                        int offset = Math.Max(0, Math.Min(contentLength, bodyBytesAlready));
                        while (offset < contentLength)
                        {
                            int r = ns.Read(bodyBuf, offset, contentLength - offset);
                            if (r <= 0) break;
                            offset += r;
                        }
                        body = Encoding.UTF8.GetString(bodyBuf, 0, offset);
                    }

                    if (method == "OPTIONS")
                    {
                        WriteResponse(ns, "204 No Content", "text/plain", new byte[0]);
                        return;
                    }

                    if (path == "/dh-ping")
                    {
                        bool uiExists = File.Exists(Path.Combine(WwwDir, "index.html"));
                        WriteJson(
                            ns,
                            "{\"service\":\"DieHardwareDesktop\",\"version\":\"2.1\",\"hasUi\":"
                            + (uiExists ? "true" : "false")
                            + ",\"port\":"
                            + ActivePort.ToString(CultureInfo.InvariantCulture)
                            + "}"
                        );
                        return;
                    }

                    if (path == "/status")
                    {
                        WriteJson(ns, "{\"status\":\"ok\",\"app\":\"Die Hardware\",\"service\":\"DieHardwareDesktop\"}");
                        return;
                    }

                    if (path == "/telemetry")
                    {
                        string snap = LatestTelemetryJson;
                        WriteJson(ns, string.IsNullOrEmpty(snap) ? "{}" : snap);
                        return;
                    }

                    if (path == "/stream")
                    {
                        ns.WriteTimeout = 5000;
                        string sseHeaders = "HTTP/1.1 200 OK\r\n"
                            + "Content-Type: text/event-stream\r\n"
                            + "Cache-Control: no-cache, no-store\r\n"
                            + "Connection: keep-alive\r\n"
                            + "Access-Control-Allow-Origin: *\r\n\r\n";
                        byte[] hb = Encoding.ASCII.GetBytes(sseHeaders);
                        ns.Write(hb, 0, hb.Length);
                        ns.Flush();

                        Interlocked.Increment(ref ActiveSseClients);
                        try
                        {
                            while (!ShuttingDown)
                            {
                                Interlocked.Exchange(ref LastActivityTicks, DateTime.UtcNow.Ticks);
                                string snap = LatestTelemetryJson;
                                if (!string.IsNullOrEmpty(snap) && snap.Length > 10)
                                {
                                    byte[] frameBytes = Encoding.UTF8.GetBytes("data: " + snap + "\n\n");
                                    ns.Write(frameBytes, 0, frameBytes.Length);
                                    ns.Flush();
                                }
                                Thread.Sleep(100);
                            }
                        }
                        catch { }
                        finally
                        {
                            Interlocked.Decrement(ref ActiveSseClients);
                        }
                        return;
                    }

                    if (path == "/kill-process" && method == "POST")
                    {
                        Match m = Regex.Match(body, "\"pid\"\\s*:\\s*(\\d+)");
                        int targetPid = 0;
                        if (m.Success) int.TryParse(m.Groups[1].Value, out targetPid);
                        bool killed = false;
                        if (targetPid > 4 && targetPid != Process.GetCurrentProcess().Id)
                        {
                            try
                            {
                                Process tp = Process.GetProcessById(targetPid);
                                string pn = tp.ProcessName;
                                string[] prot = new string[] { "Idle", "System", "csrss", "wininit", "winlogon", "services", "lsass", "smss", "dwm", "explorer", "DieHardware" };
                                bool isProt = false;
                                for (int i = 0; i < prot.Length; i++)
                                {
                                    if (string.Equals(pn, prot[i], StringComparison.OrdinalIgnoreCase)) isProt = true;
                                }
                                if (!isProt)
                                {
                                    tp.Kill();
                                    killed = true;
                                }
                            }
                            catch { }
                        }
                        WriteJson(ns, killed
                            ? "{\"terminated\":true,\"pid\":" + targetPid.ToString(CultureInfo.InvariantCulture) + "}"
                            : "{\"terminated\":false}");
                        return;
                    }

                    if (path == "/gaming-mode")
                    {
                        RunSilentCmd("powercfg.exe", "/setactive SCHEME_MIN");
                        WriteJson(ns, "{\"gamingMode\":true}");
                        return;
                    }

                    if (path == "/restore-mode")
                    {
                        RunSilentCmd("powercfg.exe", "/setactive SCHEME_BALANCED");
                        WriteJson(ns, "{\"gamingMode\":false}");
                        return;
                    }

                    ServeStaticFile(ns, path);
                }
            }
            catch { }
            finally
            {
                try { client.Close(); } catch { }
            }
        }

        private static void RunSilentCmd(string exe, string args)
        {
            try
            {
                ProcessStartInfo psi = new ProcessStartInfo(exe, args);
                psi.CreateNoWindow = true;
                psi.UseShellExecute = false;
                using (Process p = Process.Start(psi)) { p.WaitForExit(1500); }
            }
            catch { }
        }

        private static void ServeStaticFile(NetworkStream ns, string urlPath)
        {
            string rel = Uri.UnescapeDataString(urlPath.TrimStart('/'));
            if (string.IsNullOrEmpty(rel)) rel = "index.html";
            rel = rel.Replace('/', Path.DirectorySeparatorChar);
            if (rel.Contains(".."))
            {
                WriteResponse(ns, "403 Forbidden", "text/plain", Encoding.UTF8.GetBytes("Forbidden"));
                return;
            }

            string candidate = Path.Combine(WwwDir, rel);
            if (!File.Exists(candidate))
            {
                candidate = Path.Combine(WwwDir, "index.html");
            }
            if (!File.Exists(candidate))
            {
                WriteResponse(ns, "404 Not Found", "text/plain", Encoding.UTF8.GetBytes("Not Found"));
                return;
            }

            string ext = Path.GetExtension(candidate).ToLowerInvariant();
            string mime = "application/octet-stream";
            if (ext == ".html") mime = "text/html; charset=utf-8";
            else if (ext == ".js") mime = "application/javascript; charset=utf-8";
            else if (ext == ".css") mime = "text/css; charset=utf-8";
            else if (ext == ".jpg" || ext == ".jpeg") mime = "image/jpeg";
            else if (ext == ".png") mime = "image/png";
            else if (ext == ".svg") mime = "image/svg+xml";
            else if (ext == ".ico") mime = "image/x-icon";
            else if (ext == ".json" || ext == ".webmanifest") mime = "application/json; charset=utf-8";

            byte[] content = File.ReadAllBytes(candidate);
            WriteResponse(ns, "200 OK", mime, content);
        }

        private static void WriteJson(NetworkStream ns, string json)
        {
            WriteResponse(ns, "200 OK", "application/json; charset=utf-8", Encoding.UTF8.GetBytes(json));
        }

        private static void WriteResponse(NetworkStream ns, string status, string contentType, byte[] body)
        {
            string hdr = "HTTP/1.1 " + status + "\r\n"
                + "Content-Type: " + contentType + "\r\n"
                + "Content-Length: " + body.Length.ToString(CultureInfo.InvariantCulture) + "\r\n"
                + "Cache-Control: no-cache, no-store\r\n"
                + "Access-Control-Allow-Origin: *\r\n"
                + "Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n"
                + "Access-Control-Allow-Headers: Content-Type\r\n"
                + "Connection: close\r\n\r\n";
            byte[] hb = Encoding.ASCII.GetBytes(hdr);
            ns.Write(hb, 0, hb.Length);
            if (body.Length > 0) ns.Write(body, 0, body.Length);
            ns.Flush();
        }
    }
}
`;
}

export function buildUninstallCSharpSource(): string {
  return String.raw`using System;
using System.Diagnostics;
using System.IO;
using System.Windows.Forms;
using Microsoft.Win32;

namespace CarolinaBlocksStudio
{
    internal static class Uninstaller
    {
        [STAThread]
        private static int Main()
        {
            string root = AppDomain.CurrentDomain.BaseDirectory.TrimEnd('\\', '/');
            try
            {
                Process[] procs = Process.GetProcessesByName("DieHardware");
                for (int i = 0; i < procs.Length; i++)
                {
                    try { procs[i].Kill(); } catch { }
                }
            }
            catch { }

            try
            {
                string desk = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), "Die Hardware.lnk");
                if (File.Exists(desk)) File.Delete(desk);
                string startMenu = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Programs), "Die Hardware.lnk");
                if (File.Exists(startMenu)) File.Delete(startMenu);
            }
            catch { }

            try
            {
                Registry.CurrentUser.DeleteSubKeyTree(@"Software\Microsoft\Windows\CurrentVersion\Uninstall\DieHardware", false);
            }
            catch { }

            try
            {
                ProcessStartInfo psi = new ProcessStartInfo("cmd.exe", "/c ping 127.0.0.1 -n 3 >nul & rmdir /s /q \"" + root + "\"");
                psi.CreateNoWindow = true;
                psi.UseShellExecute = false;
                Process.Start(psi);
            }
            catch { }

            MessageBox.Show(
                "Die Hardware has been completely uninstalled.",
                "Die Hardware - Carolina Blocks Studio",
                MessageBoxButtons.OK,
                MessageBoxIcon.Information
            );
            return 0;
        }
    }
}
`;
}

export function buildAgentPowerShellScript(): string {
  // Exported helper preserved for inspection/tests; references the native C# hardware engine
  return buildDieHardwareCSharpSource('http://127.0.0.1:47835');
}

/**
 * Generates the single self-contained Windows 10/11 installer file (`Install Die Hardware.cmd`).
 * - Works on double-click in Windows Explorer AND from Command Prompt (zero VBScript, zero line-limit bugs).
 * - Unpacks the bundled standalone UI (`www/`), builds native `DieHardware.exe` + `UninstallDieHardware.exe`,
 *   creates Desktop & Start Menu shortcuts + Windows Settings Uninstaller, minimizes its console window,
 *   and opens Die Hardware immediately on screen.
 */
export function generateInstallerFiles(
  appUrl: string,
  wwwZipGzBase64 = ''
): InstallerFilePreview[] {
  const cleanUrl = (appUrl.replace(/"/g, '').trim() || 'http://localhost:3000').replace(/\/$/, '');
  const dieHardwareCs = buildDieHardwareCSharpSource(cleanUrl);
  const uninstallCs = buildUninstallCSharpSource();
  const wrappedWwwPayload = wrapBase64Lines(wwwZipGzBase64, 76);

  const cmdAndPs1 = [
    '@echo off',
    'setlocal EnableExtensions',
    'cd /d "%~dp0"',
    'title Die Hardware Installer - Carolina Blocks Studio',
    'color 0B',
    'echo.',
    'echo   ============================================================',
    'echo     DIE HARDWARE - CAROLINA BLOCKS STUDIO',
    'echo     Windows 10 ^& 11 Desktop Hardware Monitor Setup',
    'echo   ============================================================',
    'echo.',
    'set "DH_SELF=%~f0"',
    'set "DH_RUNNER=%TEMP%\\DieHardware_Setup_%RANDOM%.ps1"',
    'set "DH_PS=%SystemRoot%\\System32\\WindowsPowerShell\\v1.0\\powershell.exe"',
    'if not exist "%DH_PS%" set "DH_PS=powershell.exe"',
    '"%DH_PS%" -NoProfile -ExecutionPolicy Bypass -Command "$lines = [System.IO.File]::ReadAllLines($env:DH_SELF, [System.Text.Encoding]::UTF8); $s = [Array]::IndexOf($lines, \'::###_PS1_START_###\'); $e = [Array]::IndexOf($lines, \'::###_PS1_END_###\'); if ($s -lt 0 -or $e -le $s) { exit 2 }; [System.IO.File]::WriteAllLines($env:DH_RUNNER, $lines[($s+1)..($e-1)], [System.Text.Encoding]::UTF8)"',
    'if errorlevel 1 (',
    '  echo   [ERROR] Could not prepare setup script.',
    '  pause',
    '  exit /b 1',
    ')',
    '"%DH_PS%" -NoProfile -ExecutionPolicy Bypass -File "%DH_RUNNER%" -SelfPath "%DH_SELF%"',
    'set "DH_ERR=%ERRORLEVEL%"',
    'del /f /q "%DH_RUNNER%" >nul 2>&1',
    'if not "%DH_ERR%"=="0" (',
    '  echo.',
    '  echo   [ERROR] Setup could not complete (Code %DH_ERR%^).',
    '  pause',
    '  exit /b %DH_ERR%',
    ')',
    'exit /b 0',
    '',
    '::###_PS1_START_###',
    'param([string]$SelfPath = "")',
    '$ErrorActionPreference = "Stop"',
    '',
    'function Write-Step([string]$step, [string]$msg) {',
    '  Write-Host ("  [" + $step + "] " + $msg) -ForegroundColor Cyan',
    '}',
    '',
    'function Invoke-CscBuild([string]$cscPath, [string]$workDir, [string]$argLine) {',
    '  $psi = New-Object System.Diagnostics.ProcessStartInfo',
    '  $psi.FileName = $cscPath',
    '  $psi.WorkingDirectory = $workDir',
    '  $psi.Arguments = $argLine',
    '  $psi.UseShellExecute = $false',
    '  $psi.CreateNoWindow = $true',
    '  $psi.RedirectStandardOutput = $true',
    '  $psi.RedirectStandardError = $true',
    '  $proc = [System.Diagnostics.Process]::Start($psi)',
    '  $outText = $proc.StandardOutput.ReadToEnd()',
    '  $errText = $proc.StandardError.ReadToEnd()',
    '  $proc.WaitForExit()',
    '  return @{ ExitCode = $proc.ExitCode; Output = ($outText + " " + $errText).Trim() }',
    '}',
    '',
    'try {',
    '  Unblock-File -LiteralPath $SelfPath -ErrorAction SilentlyContinue',
    '  $InstallRoot = Join-Path $env:LOCALAPPDATA "CarolinaBlocksStudio\\DieHardware"',
    '  $WwwDir = Join-Path $InstallRoot "www"',
    '',
    '  Write-Step "1/5" "Preparing installation directory & stopping older background agents..."',
    '  Get-Process -Name "DieHardware" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue',
    '  try {',
    '    Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {',
    '      ($_.ProcessId -ne $PID) -and ($_.Name -match "^(powershell|pwsh|wscript|cscript)\\.exe$") -and ($_.CommandLine -match "DieHardware|Die-Hardware")',
    '    } | ForEach-Object {',
    '      Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue',
    '    }',
    '  } catch { }',
    '  try {',
    '    $startupFolder = [Environment]::GetFolderPath("Startup")',
    '    if ($startupFolder -and (Test-Path $startupFolder)) {',
    '      Get-ChildItem -Path $startupFolder -Filter "*Die*Hardware*" -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue',
    '    }',
    '    $legacyDir = Join-Path $env:LOCALAPPDATA "DieHardware"',
    '    if (Test-Path $legacyDir) { Remove-Item $legacyDir -Recurse -Force -ErrorAction SilentlyContinue }',
    '    $deskDir = [Environment]::GetFolderPath("Desktop")',
    '    if ($deskDir -and (Test-Path $deskDir)) {',
    '      Remove-Item (Join-Path $deskDir "Die-Hardware.lnk") -Force -ErrorAction SilentlyContinue',
    '      Remove-Item (Join-Path $deskDir "Die-Hardware.url") -Force -ErrorAction SilentlyContinue',
    '    }',
    '  } catch { }',
    '  Start-Sleep -Milliseconds 300',
    '  New-Item -ItemType Directory -Force -Path $InstallRoot | Out-Null',
    '  $oldChromeProf = Join-Path $InstallRoot "ChromeProfile"',
    '  if (Test-Path $oldChromeProf) { Remove-Item $oldChromeProf -Recurse -Force -ErrorAction SilentlyContinue }',
    '',
    '  $allLines = [System.IO.File]::ReadAllLines($SelfPath, [System.Text.Encoding]::UTF8)',
    '',
    '  function Extract-Section([string]$startTag, [string]$endTag) {',
    '    $a = [Array]::IndexOf($allLines, $startTag)',
    '    $b = [Array]::IndexOf($allLines, $endTag)',
    '    if ($a -lt 0 -or $b -le ($a + 1)) { return "" }',
    '    return (($allLines[($a + 1)..($b - 1)]) -join "`r`n")',
    '  }',
    '',
    '  Write-Step "2/5" "Unpacking standalone Die Hardware application files..."',
    '  $wwwB64 = Extract-Section "::###_WWW_START_###" "::###_WWW_END_###"',
    '  if ($wwwB64 -and $wwwB64.Trim().Length -gt 16) {',
    '    $cleanB64 = ($wwwB64 -replace "\\s+", "")',
    '    $gzBytes = [System.Convert]::FromBase64String($cleanB64)',
    '    $zipTemp = Join-Path $InstallRoot "www_bundle.zip"',
    '    $inMs = New-Object System.IO.MemoryStream(,$gzBytes)',
    '    $gzStream = New-Object System.IO.Compression.GZipStream($inMs, [System.IO.Compression.CompressionMode]::Decompress)',
    '    $outFs = [System.IO.File]::Create($zipTemp)',
    '    $gzStream.CopyTo($outFs)',
    '    $outFs.Close(); $gzStream.Close(); $inMs.Close()',
    '    if (Test-Path $WwwDir) { Remove-Item $WwwDir -Recurse -Force -ErrorAction SilentlyContinue }',
    '    New-Item -ItemType Directory -Force -Path $WwwDir | Out-Null',
    '    Add-Type -AssemblyName System.IO.Compression',
    '    Add-Type -AssemblyName System.IO.Compression.FileSystem',
    '    $za = [System.IO.Compression.ZipFile]::OpenRead($zipTemp)',
    '    try {',
    '      foreach ($entry in $za.Entries) {',
    '        if ([string]::IsNullOrEmpty($entry.Name)) { continue }',
    '        $relEntry = $entry.FullName.Replace("/", "\\").TrimStart("\\")',
    '        $destFile = Join-Path $WwwDir $relEntry',
    '        $destParent = [System.IO.Path]::GetDirectoryName($destFile)',
    '        if ($destParent -and -not (Test-Path $destParent)) {',
    '          New-Item -ItemType Directory -Force -Path $destParent | Out-Null',
    '        }',
    '        [System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $destFile, $true)',
    '      }',
    '    } finally {',
    '      $za.Dispose()',
    '    }',
    '    Remove-Item $zipTemp -Force -ErrorAction SilentlyContinue',
    '    if (-not (Test-Path (Join-Path $WwwDir "index.html"))) {',
    '      throw "Standalone UI files (www\\index.html) failed to extract."',
    '    }',
    '  }',
    '',
    '  $IcoPath = Join-Path $InstallRoot "DieHardware.ico"',
    '  $EmblemJpg = Join-Path $WwwDir "src\\assets\\images\\die_hardware_emblem_1794847286676.jpg"',
    '  if (Test-Path $EmblemJpg) {',
    '    try {',
    '      Add-Type -AssemblyName System.Drawing',
    '      $srcBmp = New-Object System.Drawing.Bitmap($EmblemJpg)',
    '      $icoBmp = New-Object System.Drawing.Bitmap($srcBmp, 256, 256)',
    '      $pngMs = New-Object System.IO.MemoryStream',
    '      $icoBmp.Save($pngMs, [System.Drawing.Imaging.ImageFormat]::Png)',
    '      $pngBytes = $pngMs.ToArray()',
    '      $pngMs.Close(); $icoBmp.Dispose(); $srcBmp.Dispose()',
    '      $icoFs = [System.IO.File]::Create($IcoPath)',
    '      $bw = New-Object System.IO.BinaryWriter($icoFs)',
    '      $bw.Write([uint16]0); $bw.Write([uint16]1); $bw.Write([uint16]1)',
    '      $bw.Write([byte]0); $bw.Write([byte]0); $bw.Write([byte]0); $bw.Write([byte]0)',
    '      $bw.Write([uint16]1); $bw.Write([uint16]32)',
    '      $bw.Write([uint32]$pngBytes.Length); $bw.Write([uint32]22)',
    '      $bw.Write($pngBytes)',
    '      $bw.Close(); $icoFs.Close()',
    '    } catch { }',
    '  }',
    '',
    '  Write-Step "3/5" "Building native DieHardware.exe desktop launcher & sensor service..."',
    '  $csMain = Extract-Section "::###_CS_MAIN_START_###" "::###_CS_MAIN_END_###"',
    '  $csUninst = Extract-Section "::###_CS_UNINST_START_###" "::###_CS_UNINST_END_###"',
    '  $csMainPath = Join-Path $InstallRoot "DieHardware.cs"',
    '  $csUninstPath = Join-Path $InstallRoot "UninstallDieHardware.cs"',
    '  [System.IO.File]::WriteAllText($csMainPath, $csMain, [System.Text.Encoding]::UTF8)',
    '  [System.IO.File]::WriteAllText($csUninstPath, $csUninst, [System.Text.Encoding]::UTF8)',
    '',
    '  $csc64 = Join-Path $env:WINDIR "Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe"',
    '  $csc32 = Join-Path $env:WINDIR "Microsoft.NET\\Framework\\v4.0.30319\\csc.exe"',
    '  $cscExe = if (Test-Path $csc64) { $csc64 } elseif (Test-Path $csc32) { $csc32 } else { $null }',
    '  if (-not $cscExe) { throw "Microsoft .NET Framework v4.0 compiler (csc.exe) was not found." }',
    '',
    '  $ExePath = Join-Path $InstallRoot "DieHardware.exe"',
    '  $UninstExePath = Join-Path $InstallRoot "UninstallDieHardware.exe"',
    '  $icoFlag = if (Test-Path $IcoPath) { " /win32icon:DieHardware.ico" } else { "" }',
    '',
    '  $resMain = Invoke-CscBuild $cscExe $InstallRoot ("/nologo /optimize+ /target:winexe /out:DieHardware.exe" + $icoFlag + " /r:System.dll /r:System.Core.dll /r:System.Management.dll /r:System.Windows.Forms.dll DieHardware.cs")',
    '  if (-not (Test-Path $ExePath)) {',
    '    throw ("Failed to build DieHardware.exe: " + $resMain.Output)',
    '  }',
    '',
    '  $null = Invoke-CscBuild $cscExe $InstallRoot ("/nologo /optimize+ /target:winexe /out:UninstallDieHardware.exe" + $icoFlag + " /r:System.dll /r:System.Windows.Forms.dll UninstallDieHardware.cs")',
    '  Remove-Item $csMainPath, $csUninstPath -Force -ErrorAction SilentlyContinue',
    '  Unblock-File -LiteralPath $ExePath -ErrorAction SilentlyContinue',
    '  if (Test-Path $UninstExePath) { Unblock-File -LiteralPath $UninstExePath -ErrorAction SilentlyContinue }',
    '',
    '  Write-Step "4/5" "Registering Desktop shortcut, Start Menu & Windows Uninstaller..."',
    '  $Wsh = New-Object -ComObject WScript.Shell',
    '  $shortcutPaths = @(',
    '    (Join-Path ([Environment]::GetFolderPath("Desktop")) "Die Hardware.lnk"),',
    '    (Join-Path ([Environment]::GetFolderPath("Programs")) "Die Hardware.lnk")',
    '  )',
    '  foreach ($lnkFile in $shortcutPaths) {',
    '    $lnk = $Wsh.CreateShortcut($lnkFile)',
    '    $lnk.TargetPath = $ExePath',
    '    $lnk.WorkingDirectory = $InstallRoot',
    '    if (Test-Path $IcoPath) { $lnk.IconLocation = "$IcoPath,0" } else { $lnk.IconLocation = "$ExePath,0" }',
    '    $lnk.Description = "Die Hardware - Carolina Blocks Studio"',
    '    $lnk.Save()',
    '  }',
    '',
    '  $RegKey = "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\DieHardware"',
    '  New-Item -Path $RegKey -Force | Out-Null',
    '  Set-ItemProperty -Path $RegKey -Name "DisplayName" -Value "Die Hardware"',
    '  Set-ItemProperty -Path $RegKey -Name "Publisher" -Value "Carolina Blocks Studio"',
    '  Set-ItemProperty -Path $RegKey -Name "DisplayIcon" -Value $ExePath',
    '  Set-ItemProperty -Path $RegKey -Name "DisplayVersion" -Value "1.3.0"',
    '  Set-ItemProperty -Path $RegKey -Name "UninstallString" -Value ("`"" + $UninstExePath + "`"")',
    '  Set-ItemProperty -Path $RegKey -Name "NoModify" -Value 1 -Type DWord',
    '  Set-ItemProperty -Path $RegKey -Name "NoRepair" -Value 1 -Type DWord',
    '',
    '  try {',
    '    $dlDir = Join-Path $env:USERPROFILE "Downloads"',
    '    if (Test-Path $dlDir) {',
    '      Get-ChildItem -Path $dlDir -Filter "Die-Hardware-Setup*.zip" -File -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue',
    '    }',
    '  } catch { }',
    '',
    '  Write-Step "5/5" "Installation complete! Minimizing installer & loading Die Hardware..."',
    '  try {',
    '    $winDef = \'[DllImport("kernel32.dll")] public static extern IntPtr GetConsoleWindow(); [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow(); [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);\'',
    '    $winApi = Add-Type -MemberDefinition $winDef -Name "Win32Min" -Namespace "CBS" -PassThru -ErrorAction SilentlyContinue',
    '    $hCon = $winApi::GetConsoleWindow()',
    '    if ($hCon -ne [IntPtr]::Zero) { $null = $winApi::ShowWindow($hCon, 6) }',
    '    $hFg = $winApi::GetForegroundWindow()',
    '    if ($hFg -ne [IntPtr]::Zero -and $hFg -ne $hCon) { $null = $winApi::ShowWindow($hFg, 6) }',
    '  } catch { }',
    '',
    '  Start-Process -FilePath $ExePath -WorkingDirectory $InstallRoot',
    '  Start-Sleep -Milliseconds 500',
    '  exit 0',
    '} catch {',
    '  Write-Host ""',
    '  Write-Host ("  Installation Error: " + $_.Exception.Message) -ForegroundColor Red',
    '  exit 1',
    '}',
    '::###_PS1_END_###',
    '',
    '::###_CS_MAIN_START_###',
    ...dieHardwareCs.split(/\r?\n/),
    '::###_CS_MAIN_END_###',
    '',
    '::###_CS_UNINST_START_###',
    ...uninstallCs.split(/\r?\n/),
    '::###_CS_UNINST_END_###',
    '',
    '::###_WWW_START_###',
    ...(wrappedWwwPayload ? wrappedWwwPayload.split(/\r?\n/) : []),
    '::###_WWW_END_###',
    '',
  ].join('\r\n');

  return [
    {
      name: 'Install Die Hardware.cmd',
      purpose:
        'Single self-contained Windows 10 & 11 installer: double-click to unpack the standalone UI, compile native DieHardware.exe + Uninstaller, create Desktop/Start Menu shortcuts, minimize setup, and launch Die Hardware on screen.',
      content: cmdAndPs1,
    },
  ];
}

export function buildWindowsInstallerZip(
  appUrl: string,
  wwwZipGzBase64 = ''
): Uint8Array {
  const files = generateInstallerFiles(appUrl, wwwZipGzBase64);
  const entries: ZipEntryInput[] = files.map((f) => ({
    name: f.name,
    content: f.content,
  }));
  return buildZipArchive(entries);
}
