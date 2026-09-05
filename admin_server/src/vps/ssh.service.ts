import { Injectable, Logger } from '@nestjs/common';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import ssh2 from 'ssh2';
import type { ConnectConfig } from 'ssh2';

/**
 * ⚠ NOMLI IMPORT ISHLAMAYDI — STANDART IMPORTDAN DESTRUKTURATSIYA.
 *
 * `ssh2` — CommonJS paketi, bu loyiha esa ESM (`"type": "module"`).
 * Node bunday paketdan nomli eksportlarni STATIK tahlil bilan topadi
 * (`cjs-module-lexer`) va u `ssh2` da HAMMASINI ko'ra olmaydi:
 * `Client` topiladi, `utils` esa YO'Q. Natijada
 * `import { utils } from 'ssh2'` ish vaqtida yiqilardi —
 * "does not provide an export named 'utils'", garchi TypeScript
 * (@types/ssh2 ga qarab) uni xatosiz o'tkazib yuborsa ham.
 *
 * Ya'ni bu xatoni `tsc` HECH QACHON ushlamaydi — faqat ishga tushirish
 * ushlaydi. Shu sabab bu yerda qat'iy naqsh: modulni BUTUNLIGICHA
 * olamiz va o'zimiz ajratamiz.
 *
 * Tiplar (`ConnectConfig`) alohida `import type` bilan — ular
 * kompilyatsiyada o'chiriladi va ish vaqtiga umuman yetib bormaydi.
 */
const { Client, utils: sshUtils } = ssh2;
import type { Vps } from '@prisma/client';
import { decryptSecret } from '../common/crypto/secrets.util.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SSH — VPS BILAN GAPLASHISH. `ssh2` KUTUBXONASI, `ssh` CLI EMAS.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ── NEGA CLI EMAS ──
 * `ssh` binarini chaqirish uchun xususiy kalit DISKKA yozilishi kerak
 * (vaqtinchalik fayl, 0600). Bu sirning ochiq nusxasi — jarayon
 * yiqilsa u qolib ketadi. `ssh2` kalitni xotirada oladi va hech qayerga
 * yozmaydi. Qo'shimcha: `known_hosts` savoli, `StrictHostKeyChecking`
 * bayroqlari va `sshpass` (parol uchun) — hammasi yo'qoladi.
 *
 * ── LOKAL VPS ──
 * `vps.isLocal` — admin_server turgan mashina. SSH o'rniga `bash -c`.
 * Bir xil interfeys: chaqiruvchi farqni bilmaydi. Shunda provisioning
 * ikkala holatda bitta kod bilan ishlaydi (3-faza).
 *
 * ── LOG OQIMI ──
 * `exec` chiqishni `onData` orqali BO'LAKLAB beradi — deploy jurnali
 * panelga tirik boradi, jarayon tugashini kutmaydi. Bu 20 daqiqalik
 * provision uchun muhim: "hali ishlayaptimi" savoliga javob bor.
 */

export interface ExecResult {
  code: number;
  stdout: string;
  stderr: string;
}

export interface ExecOptions {
  /** Har bir chiqish bo'lagi — stdout va stderr aralash, tartibda. */
  onData?: (chunk: string, stream: 'stdout' | 'stderr') => void;
  /** Millisekund. Standart 30 daqiqa — provision uzoq. */
  timeoutMs?: number;
  /** stdin ga yuboriladigan matn (skript tanasi `bash -s` uchun). */
  stdin?: string;
}

const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;
const CONNECT_TIMEOUT_MS = 15_000;

@Injectable()
export class SshService {
  private readonly logger = new Logger('SSH');

  /** Xususiy kalitdan ochiq kalit barmoq izi (SHA256:…) — UI uchun. */
  fingerprintOf(privateKeyPem: string): string | null {
    try {
      const parsed = sshUtils.parseKey(privateKeyPem);
      const key = Array.isArray(parsed) ? parsed[0] : parsed;
      if (key instanceof Error || !key) return null;
      const pub = key.getPublicSSH();
      return 'SHA256:' + createHash('sha256').update(pub).digest('base64').replace(/=+$/, '');
    } catch {
      return null;
    }
  }

  /** Kalit sintaktik to'g'rimi — saqlashdan OLDIN tekshiriladi. */
  validatePrivateKey(privateKeyPem: string): string | null {
    const parsed = sshUtils.parseKey(privateKeyPem);
    const key = Array.isArray(parsed) ? parsed[0] : parsed;
    if (key instanceof Error) return key.message;
    if (!key) return "Kalit o'qilmadi";
    return null;
  }

  private connectConfig(vps: Vps): ConnectConfig {
    const cfg: ConnectConfig = {
      host: vps.host,
      port: vps.sshPort,
      username: vps.sshUser,
      readyTimeout: CONNECT_TIMEOUT_MS,
      // Host kaliti tekshiruvi: birinchi ulanishda qabul qilinadi.
      // TODO(3-faza): `Vps.hostKeyFingerprint` saqlab, keyingi
      // ulanishlarda solishtirish (MITM himoyasi).
    };
    if (vps.authMethod === 'PASSWORD') {
      if (!vps.sshPassword) throw new Error("VPS uchun SSH parol sozlanmagan");
      cfg.password = decryptSecret(vps.sshPassword);
    } else {
      if (!vps.sshPrivateKey) throw new Error("VPS uchun SSH kalit sozlanmagan");
      cfg.privateKey = decryptSecret(vps.sshPrivateKey);
    }
    return cfg;
  }

  /**
   * VPS ichidagi Postgres'ga TUNNEL: `forwardOut` duplex oqimini qaytaradi.
   * `pg` `Client({ stream })` uni soket sifatida ishlatadi. Chaqiruvchi
   * ishi tugagach `close()` ni chaqirishi SHART — aks holda SSH sessiya
   * osilib qoladi.
   */
  openPgTunnel(vps: Vps): Promise<{ stream: import('node:stream').Duplex; close: () => void }> {
    const target = this.pgTargetOf(vps);
    return new Promise((resolve, reject) => {
      const conn = new Client();
      const timer = setTimeout(() => { conn.end(); reject(new Error('SSH tunnel: vaqt tugadi')); }, CONNECT_TIMEOUT_MS);
      conn
        .on('ready', () => {
          conn.forwardOut('127.0.0.1', 0, target.host, target.port, (err, stream) => {
            clearTimeout(timer);
            if (err) { conn.end(); return reject(new Error(`SSH tunnel ochilmadi: ${err.message}`)); }
            stream.on('close', () => conn.end());
            resolve({ stream, close: () => { try { stream.end(); } catch { /* yopiq */ } conn.end(); } });
          });
        })
        .on('error', (err) => { clearTimeout(timer); reject(new Error(`SSH: ${err.message}`)); });
      try {
        conn.connect(this.connectConfig(vps));
      } catch (err) {
        clearTimeout(timer);
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  /** `postgresBaseUrl` dan VPS ICHIDAGI host:port (tunnel nishoni). */
  private pgTargetOf(vps: Vps): { host: string; port: number } {
    try {
      const raw = vps.postgresBaseUrl ? decryptSecret(vps.postgresBaseUrl) : '';
      if (raw) {
        const u = new URL(raw.replace(/\/+$/, ''));
        return { host: u.hostname || '127.0.0.1', port: Number(u.port) || 5432 };
      }
    } catch { /* standart */ }
    return { host: '127.0.0.1', port: 5432 };
  }

  /** Buyruqni bajaradi — lokal yoki SSH, chaqiruvchi farqni bilmaydi. */
  async exec(vps: Vps, command: string, opts: ExecOptions = {}): Promise<ExecResult> {
    return vps.isLocal ? this.execLocal(command, opts) : this.execRemote(vps, command, opts);
  }

  private execLocal(command: string, opts: ExecOptions): Promise<ExecResult> {
    return new Promise((resolve) => {
      const child = spawn('bash', ['-c', command], { env: process.env });
      let stdout = '';
      let stderr = '';
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        stderr += `\n[timeout ${opts.timeoutMs ?? DEFAULT_TIMEOUT_MS} ms]`;
      }, opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
      child.stdout.on('data', (d: Buffer) => { const s = d.toString(); stdout += s; opts.onData?.(s, 'stdout'); });
      child.stderr.on('data', (d: Buffer) => { const s = d.toString(); stderr += s; opts.onData?.(s, 'stderr'); });
      child.on('close', (code) => { clearTimeout(timer); resolve({ code: code ?? 1, stdout, stderr }); });
      child.on('error', (err) => { clearTimeout(timer); resolve({ code: 1, stdout, stderr: stderr + err.message }); });
      if (opts.stdin != null) child.stdin.end(opts.stdin);
      else child.stdin.end();
    });
  }

  private execRemote(vps: Vps, command: string, opts: ExecOptions): Promise<ExecResult> {
    return new Promise((resolve) => {
      const conn = new Client();
      let stdout = '';
      let stderr = '';
      let settled = false;
      const finish = (r: ExecResult) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        try { conn.end(); } catch { /* yopilgan */ }
        resolve(r);
      };
      const timer = setTimeout(
        () => finish({ code: 124, stdout, stderr: stderr + `\n[timeout ${opts.timeoutMs ?? DEFAULT_TIMEOUT_MS} ms]` }),
        opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      );

      conn
        .on('ready', () => {
          conn.exec(command, (err, stream) => {
            if (err) return finish({ code: 1, stdout, stderr: err.message });
            stream.on('data', (d: Buffer) => { const s = d.toString(); stdout += s; opts.onData?.(s, 'stdout'); });
            stream.stderr.on('data', (d: Buffer) => { const s = d.toString(); stderr += s; opts.onData?.(s, 'stderr'); });
            stream.on('close', (code: number | null) => finish({ code: code ?? 1, stdout, stderr }));
            if (opts.stdin != null) stream.end(opts.stdin);
          });
        })
        .on('error', (err) => {
          this.logger.warn(`SSH ${vps.sshUser}@${vps.host}:${vps.sshPort} — ${err.message}`);
          finish({ code: 255, stdout, stderr: stderr + err.message });
        });

      try {
        conn.connect(this.connectConfig(vps));
      } catch (err) {
        finish({ code: 255, stdout: '', stderr: err instanceof Error ? err.message : String(err) });
      }
    });
  }
}
