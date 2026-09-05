import { Injectable, Logger } from '@nestjs/common';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import type { Vps } from '@prisma/client';
import { SshService } from '../vps/ssh.service.js';
import { decryptSecret } from '../common/crypto/secrets.util.js';
import { LOG_LIMIT } from './script-runner.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SKRIPTNI TANLANGAN VPS'DA BAJARISH — LOKAL YOKI SSH
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `script-runner.ts` dagi `runScript()` lokal `spawn('bash')` edi va
 * shundayligicha QOLADI (botlar undan foydalanadi). Bu servis uning
 * ustidagi qatlam: `vps.isLocal` bo'lsa o'sha lokal yo'l, aks holda
 * SSH.
 *
 * ── MASOFAVIY BAJARISH QANDAY ──
 *
 *  1) BOOTSTRAP — `${rootDir}/admin/` ga skriptlar (`*.sh`) SFTP orqali
 *     yuklanadi. Har safar: fayllar kichik, taqqoslash sha256 bilan —
 *     o'zgarmagan fayl qayta yuklanmaydi. Shunda admin_server'dagi
 *     skript tuzatilsa hamma VPS keyingi deploy'da yangisini oladi.
 *
 *  2) SHABLON — provision uchun `TENANT_TEMPLATE_DIR` (tenant kodining
 *     manbasi) VPS'da bo'lishi kerak. Yo'q bo'lsa lokal shablon papkasi
 *     `tar` bilan oqim sifatida yuboriladi (node_modules/dist/.env/uploads
 *     chiqarib tashlanadi). Faqat provision/deploy uchun; restart uchun
 *     kerak emas.
 *
 *  3) EXEC — `bash -lc 'cd ${rootDir}/admin && <env> bash ./script.sh'`.
 *     ENV qiymatlari `'...'` bilan qochiriladi (`shq`). Sirlar bu yerda
 *     ham bor (GIT_TOKEN), lekin SSH kanali shifrlangan va buyruq
 *     masofaviy `ps` da ko'rinadi — LOKAL bilan bir xil holat (spawn
 *     env ham `/proc/<pid>/environ` da). Yaxshilash 5-fazada: sirlarni
 *     stdin orqali.
 *
 * ── PLATFORMA ENV ──
 * Lokal skriptlar `process.env` dan `TENANTS_ROOT`, `POSTGRES_BASE_URL`
 * va shu kabilarni oladi. Masofaviy VPS'da bu qiymatlar BOSHQA bo'lishi
 * kerak: `TENANTS_ROOT=${rootDir}/tenants`, `POSTGRES_BASE_URL` = VPS'ning
 * o'z Postgres'i (`vps.postgresBaseUrl`, shifrlangan). `platformEnv()`
 * shuni hisoblaydi.
 */

export type LogSink = (chunk: string) => void;

export interface RunResult {
  code: number | null;
  log: string;
}

const shq = (v: string) => `'${String(v).replace(/'/g, `'\\''`)}'`;

/** Skriptlar turadigan lokal papka — `PROVISION_SCRIPT` ning papkasi. */
export const localScriptsDir = (): string =>
  path.dirname(process.env.PROVISION_SCRIPT || '/root/admin/provision.sh');

const SCRIPT_FILES = [
  'provision.sh',
  'reconfigure.sh',
  'deprovision.sh',
  'git-sync.sh',
  'bot-provision.sh',
  'bot-deprovision.sh',
];

const TEMPLATE_EXCLUDES = ['node_modules', 'dist', '.env', 'uploads', '.git', 'coverage', '*.log'];

@Injectable()
export class ScriptRunnerService {
  private readonly logger = new Logger('ScriptRunner');

  constructor(private readonly ssh: SshService) {}

  /** VPS uchun skript yo'li (masofaviy — `${rootDir}/admin`). */
  scriptPath(vps: Vps | null, name: string): string {
    if (!vps || vps.isLocal) {
      const envKey = {
        'provision.sh': 'PROVISION_SCRIPT',
        'reconfigure.sh': 'RECONFIGURE_SCRIPT',
        'deprovision.sh': 'DEPROVISION_SCRIPT',
      }[name];
      return (envKey && process.env[envKey]) || path.join(localScriptsDir(), name);
    }
    return path.posix.join(vps.rootDir, 'admin', name);
  }

  /** Masofaviy VPS uchun platforma sozlamalari. Lokal uchun `{}` (process.env qoladi). */
  platformEnv(vps: Vps | null): Record<string, string> {
    if (!vps || vps.isLocal) return {};
    const root = vps.rootDir.replace(/\/+$/, '');
    const env: Record<string, string> = {
      TENANTS_ROOT: `${root}/tenants`,
      WEB_ROOT_BASE: process.env.WEB_ROOT_BASE || '/var/www',
      WEB_USER: process.env.WEB_USER || 'www-data',
      CERTBOT_EMAIL: process.env.CERTBOT_EMAIL || 'admin@example.uz',
      NGINX_SITES: process.env.NGINX_SITES || '/etc/nginx/sites-available',
      NGINX_ENABLED: process.env.NGINX_ENABLED || '/etc/nginx/sites-enabled',
      POSTGRES_BASE_URL: vps.postgresBaseUrl
        ? decryptSecret(vps.postgresBaseUrl)
        : 'postgresql://postgres:postgres@127.0.0.1:5432',
      POSTGRES_ADMIN_DB: process.env.POSTGRES_ADMIN_DB || 'postgres',
    };
    return env;
  }

  // ── Bootstrap ──────────────────────────────────────────────────────────

  /**
   * Skriptlarni VPS'ga sinxronlaydi. Idempotent: sha256 bir xil bo'lsa
   * yuklanmaydi. Lokal VPS uchun hech narsa qilmaydi.
   */
  async syncScripts(vps: Vps, log: LogSink): Promise<void> {
    if (vps.isLocal) return;
    const remoteDir = path.posix.join(vps.rootDir, 'admin');
    const localDir = localScriptsDir();

    const want: { name: string; content: Buffer; sha: string }[] = [];
    for (const name of SCRIPT_FILES) {
      const p = path.join(localDir, name);
      if (!existsSync(p)) continue;
      const content = readFileSync(p);
      want.push({ name, content, sha: createHash('sha256').update(content).digest('hex') });
    }
    if (!want.length) throw new Error(`Lokal skriptlar topilmadi: ${localDir}`);

    // Masofadagi hashlar
    const probe = await this.ssh.exec(
      vps,
      `mkdir -p ${shq(remoteDir)} && cd ${shq(remoteDir)} && for f in ${want.map((w) => shq(w.name)).join(' ')}; do [ -f "$f" ] && sha256sum "$f" || echo "missing  $f"; done`,
      { timeoutMs: 30_000 },
    );
    if (probe.code !== 0 && probe.code !== 1) {
      throw new Error(`Skript papkasini tekshirib bo'lmadi: ${probe.stderr || probe.stdout}`);
    }
    const remote = new Map<string, string>();
    for (const line of probe.stdout.split('\n')) {
      const m = line.trim().match(/^([0-9a-f]{64}|missing)\s+\*?(.+)$/);
      if (m) remote.set(m[2].trim(), m[1]);
    }

    const stale = want.filter((w) => remote.get(w.name) !== w.sha);
    if (!stale.length) {
      log(`==> Skriptlar yangi (${want.length} ta) — ${remoteDir}\n`);
      return;
    }
    log(`==> Skriptlar yuklanmoqda (${stale.length}/${want.length}): ${stale.map((s) => s.name).join(', ')}\n`);
    for (const w of stale) {
      // base64 orqali — SFTP subsystem hamma serverda yoqilgan bo'lmaydi.
      const b64 = w.content.toString('base64');
      const r = await this.ssh.exec(
        vps,
        `printf '%s' ${shq(b64)} | base64 -d > ${shq(path.posix.join(remoteDir, w.name))} && chmod 755 ${shq(path.posix.join(remoteDir, w.name))}`,
        { timeoutMs: 30_000 },
      );
      if (r.code !== 0) throw new Error(`${w.name} yuklanmadi: ${r.stderr}`);
    }
  }

  /**
   * Shablon (tenant kodi manbasi) VPS'da bormi; yo'q bo'lsa lokaldan
   * tar oqimi bilan yuboriladi. Katta bo'lishi mumkin (bir necha o'n MB).
   */
  async ensureTemplate(vps: Vps, templateDir: string, log: LogSink): Promise<void> {
    if (vps.isLocal) return;
    if (!templateDir) throw new Error('Shablon papkasi ko\'rsatilmagan');

    const check = await this.ssh.exec(vps, `test -d ${shq(templateDir)}/server && test -d ${shq(templateDir)}/client && echo OK`, {
      timeoutMs: 15_000,
    });
    if (check.stdout.trim() === 'OK') {
      log(`==> Shablon mavjud: ${templateDir}\n`);
      return;
    }
    if (!existsSync(templateDir) || !statSync(templateDir).isDirectory()) {
      throw new Error(`Shablon VPS'da ham, lokalda ham yo'q: ${templateDir}`);
    }

    log(`==> Shablon yuklanmoqda (tar): ${templateDir}\n`);
    const excludes = TEMPLATE_EXCLUDES.map((e) => `--exclude=${shq(e)}`).join(' ');
    // Lokal: tar → base64 oqimi; masofa: base64 -d | tar x. Oqim sifatida
    // (stdin) — xotiraga to'liq yuklanmaydi.
    const tar = spawn('bash', ['-c', `tar czf - ${excludes} -C ${shq(templateDir)} .`]);
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const c of tar.stdout) { chunks.push(c as Buffer); size += (c as Buffer).length; }
    const archive = Buffer.concat(chunks);
    log(`    arxiv: ${(size / 1024 / 1024).toFixed(1)} MB\n`);

    const r = await this.ssh.exec(
      vps,
      `mkdir -p ${shq(templateDir)} && tar xzf - -C ${shq(templateDir)}`,
      { stdin: archive.toString('binary'), timeoutMs: 20 * 60_000 },
    );
    if (r.code !== 0) throw new Error(`Shablon yuklanmadi: ${r.stderr.slice(-500)}`);
    log(`==> Shablon joylandi\n`);
  }

  // ── Bajarish ───────────────────────────────────────────────────────────

  /**
   * Skriptni bajaradi va butun logni qaytaradi; `onLog` bilan tirik oqim.
   * Hech qachon reject qilmaydi (chaqiruvchi doim holatni yozishi kerak).
   */
  async run(
    vps: Vps | null,
    scriptName: string,
    env: Record<string, string>,
    onLog?: LogSink,
  ): Promise<RunResult> {
    let log = '';
    const sink: LogSink = (chunk) => {
      log += chunk;
      if (log.length > LOG_LIMIT) log = log.slice(-LOG_LIMIT);
      onLog?.(chunk);
    };

    if (!vps || vps.isLocal) {
      const code = await this.runLocal(this.scriptPath(vps, scriptName), env, sink);
      return { code, log };
    }

    try {
      await this.syncScripts(vps, sink);
      if (env.TENANT_TEMPLATE_DIR && (scriptName === 'provision.sh' || env.APPLY_MODE === 'deploy')) {
        await this.ensureTemplate(vps, env.TENANT_TEMPLATE_DIR, sink);
      }
    } catch (err) {
      sink(`\n❌ Bootstrap xatosi: ${err instanceof Error ? err.message : String(err)}\n`);
      return { code: -1, log };
    }

    const fullEnv = { ...this.platformEnv(vps), ...env };
    const exports = Object.entries(fullEnv)
      .map(([k, v]) => `export ${k}=${shq(v)}`)
      .join('; ');
    const remoteDir = path.posix.join(vps.rootDir, 'admin');
    const cmd = `bash -lc ${shq(`cd ${shq(remoteDir)} && ${exports}; bash ./${scriptName}`)}`;

    const r = await this.ssh.exec(vps, cmd, {
      onData: (chunk) => sink(chunk),
      timeoutMs: 40 * 60_000,
    });
    if (r.code === 255) sink(`\n❌ SSH: ${r.stderr.trim().split('\n').pop()}\n`);
    return { code: r.code, log };
  }

  /** Lokal bajarish — `script-runner.ts` dagi `runScript` bilan bir xil semantika. */
  private runLocal(scriptPath: string, env: Record<string, string>, sink: LogSink): Promise<number | null> {
    return new Promise((resolve) => {
      const cwd = process.env.PROVISION_CWD || path.dirname(scriptPath);
      const child = spawn('bash', [scriptPath], { env: { ...process.env, ...env }, cwd });
      child.stdout.on('data', (c: Buffer) => sink(c.toString()));
      child.stderr.on('data', (c: Buffer) => sink(c.toString()));
      child.on('close', (code) => resolve(code));
      child.on('error', (err) => {
        sink(`\n❌ Skriptni ishga tushirib bo'lmadi: ${err.message}`);
        resolve(-1);
      });
    });
  }
}
