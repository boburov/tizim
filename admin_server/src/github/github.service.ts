/**
 * GitHub REST API bilan ishlash: har tenant uchun alohida repo ochish,
 * unga deploy tokenini secret sifatida qo'yish va o'chirishda arxivlash.
 *
 * Kod repoga VPS'dan yuboriladi (provision.sh) — admin server faqat repo
 * YARATADI va kirish huquqini beradi. Sabab: kod VPS'da allaqachon bor,
 * uni admin serverga tortib olib qayta yuborish ortiqcha yo'l.
 *
 * Kerakli sozlamalar (admin_server/.env):
 *   GITHUB_TOKEN       — `repo` huquqli PAT (fine-grained bo'lsa:
 *                        Administration: RW, Contents: RW, Secrets: RW)
 *   GITHUB_OWNER       — hisob yoki tashkilot nomi
 *   GITHUB_OWNER_TYPE  — "user" (standart) yoki "org"
 *   GITHUB_REPO_PREFIX — repo nomi oldiga qo'shiladigan prefiks (masalan "lc-")
 *   GITHUB_REPO_PRIVATE — "false" berilsa ochiq repo (tavsiya etilmaydi)
 */
import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';

const API = 'https://api.github.com';

export interface CreatedRepo {
  fullName: string;
  htmlUrl: string;
  cloneUrl: string;
  private: boolean;
  defaultBranch: string;
}

@Injectable()
export class GithubService {
  private readonly logger = new Logger(GithubService.name);

  get token(): string {
    return process.env.GITHUB_TOKEN || '';
  }

  get owner(): string {
    return process.env.GITHUB_OWNER || '';
  }

  private get isOrg(): boolean {
    return (process.env.GITHUB_OWNER_TYPE || 'user').toLowerCase() === 'org';
  }

  /** Integratsiya yoqilganmi — token va owner ikkalasi ham kerak. */
  isConfigured(): boolean {
    return Boolean(this.token && this.owner);
  }

  private requireConfig() {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException(
        "GitHub integratsiyasi sozlanmagan — admin_server/.env da GITHUB_TOKEN va GITHUB_OWNER ni to'ldiring",
      );
    }
  }

  private async request<T>(
    path: string,
    init: RequestInit & { expectEmpty?: boolean } = {},
  ): Promise<T> {
    const res = await fetch(`${API}${path}`, {
      ...init,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${this.token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
        ...(init.headers || {}),
      },
      signal: AbortSignal.timeout(20000),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      let message = `GitHub API ${res.status}`;
      try {
        const parsed = JSON.parse(body);
        message = parsed.message || message;
        // Validatsiya xatolarida asl sabab `errors` ichida bo'ladi
        if (Array.isArray(parsed.errors) && parsed.errors.length) {
          message += `: ${parsed.errors.map((e: any) => e.message || e.code).join(', ')}`;
        }
      } catch {
        if (body) message += `: ${body.slice(0, 200)}`;
      }
      const err = new Error(message) as Error & { status?: number };
      err.status = res.status;
      throw err;
    }

    if (init.expectEmpty || res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  /**
   * Tenant DB nomidan repo nomini yasaydi.
   * `tenant_bilim_a3f9c210` -> `lc-tenant-bilim-a3f9c210`
   * (GitHub repo nomida `_` ruxsat etilgan, lekin URL'da `-` o'qilishi qulayroq.)
   */
  repoNameFor(dbName: string): string {
    const prefix = process.env.GITHUB_REPO_PREFIX || '';
    const base = dbName.replace(/_/g, '-').replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 90);
    return `${prefix}${base}`;
  }

  /**
   * Repo yaratadi. Repo allaqachon bo'lsa xato bermaydi — mavjudini
   * qaytaradi, chunki provisioning qayta urinilganda shu holat normal.
   */
  async createRepo(input: {
    dbName: string;
    tenantName: string;
    domain: string;
  }): Promise<CreatedRepo> {
    this.requireConfig();

    const name = this.repoNameFor(input.dbName);
    const isPrivate = (process.env.GITHUB_REPO_PRIVATE || 'true') !== 'false';
    const path = this.isOrg ? `/orgs/${this.owner}/repos` : '/user/repos';

    const body = {
      name,
      private: isPrivate,
      description: `O'quv markaz tizimi — ${input.tenantName} (${input.domain})`,
      has_issues: false,
      has_projects: false,
      has_wiki: false,
      // Birinchi commit VPS'dan keladi — GitHub o'zi README yaratsa,
      // push "non-fast-forward" bo'lib rad etilardi.
      auto_init: false,
    };

    try {
      const repo = await this.request<any>(path, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      this.logger.log(`Repo yaratildi: ${repo.full_name}`);
      return this.toCreatedRepo(repo);
    } catch (err: any) {
      // 422 = "name already exists on this account"
      if (err.status === 422) {
        const existing = await this.getRepo(name).catch(() => null);
        if (existing) {
          this.logger.warn(`Repo allaqachon mavjud, qayta ishlatilmoqda: ${existing.fullName}`);
          return existing;
        }
      }
      throw err;
    }
  }

  async getRepo(name: string): Promise<CreatedRepo> {
    this.requireConfig();
    const repo = await this.request<any>(`/repos/${this.owner}/${name}`);
    return this.toCreatedRepo(repo);
  }

  private toCreatedRepo(repo: any): CreatedRepo {
    return {
      fullName: repo.full_name,
      htmlUrl: repo.html_url,
      cloneUrl: repo.clone_url,
      private: repo.private,
      defaultBranch: repo.default_branch || 'main',
    };
  }

  /**
   * Repo secret'ini yozadi (GitHub Actions uchun).
   *
   * GitHub secret'ni AYNAN shu tartibda kutadi: repo public kaliti bilan
   * libsodium "sealed box" — oddiy base64 ish bermaydi.
   */
  async setRepoSecret(fullName: string, secretName: string, value: string) {
    this.requireConfig();

    const key = await this.request<{ key: string; key_id: string }>(
      `/repos/${fullName}/actions/secrets/public-key`,
    );

    // libsodium ESM ostida `ready` promise'ini kutadi
    const sodiumModule = await import('libsodium-wrappers');
    const sodium = sodiumModule.default ?? sodiumModule;
    await sodium.ready;

    const encrypted = sodium.crypto_box_seal(
      sodium.from_string(value),
      sodium.from_base64(key.key, sodium.base64_variants.ORIGINAL),
    );

    await this.request(`/repos/${fullName}/actions/secrets/${secretName}`, {
      method: 'PUT',
      expectEmpty: true,
      body: JSON.stringify({
        encrypted_value: sodium.to_base64(encrypted, sodium.base64_variants.ORIGINAL),
        key_id: key.key_id,
      }),
    });

    this.logger.log(`Repo secret yozildi: ${fullName} → ${secretName}`);
  }

  /**
   * Reponi arxivlaydi (faqat o'qish holatiga o'tkazadi).
   *
   * Tenant o'chirilganda ATAYLAB o'chirilmaydi: mijoz kodi va tarixi
   * qaytarib bo'lmas tarzda yo'qolmasligi kerak. To'liq o'chirish uchun
   * GITHUB_DELETE_REPO_ON_DEPROVISION=true qo'ying.
   */
  async archiveRepo(fullName: string): Promise<void> {
    this.requireConfig();
    await this.request(`/repos/${fullName}`, {
      method: 'PATCH',
      body: JSON.stringify({ archived: true }),
    });
    this.logger.warn(`Repo arxivlandi: ${fullName}`);
  }

  /** Reponi butunlay o'chiradi — token'da `delete_repo` huquqi kerak. */
  async deleteRepo(fullName: string): Promise<void> {
    this.requireConfig();
    await this.request(`/repos/${fullName}`, {
      method: 'DELETE',
      expectEmpty: true,
    });
    this.logger.warn(`Repo o'chirildi: ${fullName}`);
  }

  /** Tenant o'chirilganda repoga nima qilinadi — sozlamaga qarab. */
  async disposeRepo(fullName: string): Promise<'deleted' | 'archived'> {
    const hardDelete =
      (process.env.GITHUB_DELETE_REPO_ON_DEPROVISION || 'false') === 'true';

    if (hardDelete) {
      await this.deleteRepo(fullName);
      return 'deleted';
    }

    await this.archiveRepo(fullName);
    return 'archived';
  }
}
