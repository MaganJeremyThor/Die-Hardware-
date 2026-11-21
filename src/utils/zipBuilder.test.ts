import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAgentPowerShellScript,
  buildDieHardwareCSharpSource,
  buildUninstallCSharpSource,
  buildWindowsInstallerZip,
  generateInstallerFiles,
} from './windowsInstaller';

test('builds a valid PKZIP archive containing exactly one CRLF-formatted Windows CMD installer', () => {
  const samplePayload = Buffer.from('standalone-www-bundle-test').toString('base64').repeat(8);
  const files = generateInstallerFiles('https://diehardware.local', samplePayload);
  assert.equal(files.length, 1);
  assert.equal(files[0].name, 'Install Die Hardware.cmd');

  const content = files[0].content;
  assert.ok(content.startsWith('@echo off\r\n'));
  // Ensure strict CRLF line endings (zero bare LF and zero CRCRLF)
  assert.equal(content.includes('\r\r\n'), false);
  const withoutCrLf = content.replace(/\r\n/g, '');
  assert.equal(withoutCrLf.includes('\n'), false);

  // Ensure pure 7-bit ASCII so Windows CMD/PowerShell codepages never corrupt characters
  for (let i = 0; i < content.length; i++) {
    assert.ok(
      content.charCodeAt(i) <= 127,
      `Non-ASCII character at index ${i}: ${content.charCodeAt(i)}`
    );
  }

  // Ensure every single line is well below Windows CMD / script parser line-length limits
  const lines = content.split('\r\n');
  for (const line of lines) {
    assert.ok(line.length < 450, `Line exceeds safe length (${line.length}): ${line.slice(0, 60)}`);
  }

  const zipBytes = buildWindowsInstallerZip('https://diehardware.local', samplePayload);
  assert.equal(zipBytes[0], 0x50);
  assert.equal(zipBytes[1], 0x4b);
  assert.equal(zipBytes[2], 0x03);
  assert.equal(zipBytes[3], 0x04);

  // Verify DOS date in local header is not stuck on 2022 (year >= 2024)
  const dv = new DataView(zipBytes.buffer, zipBytes.byteOffset, zipBytes.byteLength);
  const dosDate = dv.getUint16(12, true);
  const decodedYear = ((dosDate >> 9) & 0x7f) + 1980;
  assert.ok(decodedYear >= 2024, `Expected current DOS year >= 2024, got ${decodedYear}`);

  const eocdOffset = zipBytes.length - 22;
  assert.equal(zipBytes[eocdOffset], 0x50);
  assert.equal(zipBytes[eocdOffset + 1], 0x4b);
  assert.equal(zipBytes[eocdOffset + 2], 0x05);
  assert.equal(zipBytes[eocdOffset + 3], 0x06);
});

test('installer and C# 5 desktop engine enforce minimize-on-finish, Chrome app mode, Fahrenheit temps, and live sensors', () => {
  const files = generateInstallerFiles('https://app.example.com', 'H4sIAAAAAAAAA+3BMQEAAADCoPVPbQwfoAAAAIC3Ab6T5KsAAA==');
  const cmd = files[0].content;

  // Installer compiles native executables, registers uninstall, cleans up ZIP, minimizes console, and launches DieHardware.exe
  assert.ok(cmd.includes('DieHardware.exe'));
  assert.ok(cmd.includes('UninstallDieHardware.exe'));
  assert.ok(cmd.includes('Uninstall\\DieHardware'));
  assert.ok(cmd.includes('Die-Hardware-Setup*.zip'));
  assert.ok(cmd.includes('ShowWindow($hCon, 6)'));
  assert.ok(cmd.includes('::###_WWW_START_###'));

  const csMain = buildDieHardwareCSharpSource('https://app.example.com');
  const csUninst = buildUninstallCSharpSource();
  const agentAlias = buildAgentPowerShellScript();
  assert.ok(agentAlias.includes('PerformanceCounter'));

  // Must remain strictly C# 5 compatible for built-in Windows .NET v4.0 csc.exe (zero $" interpolation, zero ?. null-conditional)
  for (const src of [csMain, csUninst]) {
    assert.equal(src.includes('$"'), false);
    assert.equal(src.includes('?.'), false);
    const openBraces = (src.match(/\{/g) || []).length;
    const closeBraces = (src.match(/\}/g) || []).length;
    assert.equal(openBraces, closeBraces, 'C# source must have balanced braces');
  }

  assert.ok(csMain.includes('http://127.0.0.1:'));
  assert.equal(csMain.includes('47820'), false, 'Must not reuse legacy port 47820');
  assert.ok(csMain.includes('BasePort = 47835'));
  assert.ok(csMain.includes('/dh-ping'));
  assert.ok(csMain.includes('DieHardwareDesktop'));
  assert.ok(csMain.includes('IsVerifiedDieHardwareServer'));
  assert.ok(csMain.includes('--proxy-bypass-list='));
  assert.ok(csMain.includes('chrome.exe'));
  assert.ok(csMain.includes('--app='));
  assert.ok(csMain.includes('CtoF'));
  assert.ok(csMain.includes('Win32_Processor'));
  assert.ok(csMain.includes('PerformanceCounter'));
  assert.ok(csMain.includes('/stream'));
  assert.ok(csMain.includes('/kill-process'));
  assert.ok(csMain.includes('nvidia-smi.exe'));
  assert.ok(csMain.includes('MSFT_PhysicalDisk'));
});
