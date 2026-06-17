export interface ApiError {
  status: number;
  code: string;
  state?: string;
  message: string;
  body?: unknown;
}

export interface ApiClientOptions {
  baseUrl: string;
  getDevBypassHeaders?: () => Record<string, string>;
  fetchImpl?: typeof fetch;
}

export class ApiClient {
  private readonly baseUrl: string;
  private readonly getDevBypassHeaders: () => Record<string, string>;
  private readonly fetchImpl: typeof fetch;

  constructor(options: ApiClientOptions) {
    this.baseUrl = normalizeBaseUrl(options.baseUrl);
    this.getDevBypassHeaders =
      options.getDevBypassHeaders ?? (() => ({}));
    this.fetchImpl = options.fetchImpl ?? fetch.bind(globalThis);
  }

  private buildHeaders(extra?: Record<string, string>): Record<string, string> {
    return {
      Accept: "application/json",
      ...this.getDevBypassHeaders(),
      ...(extra ?? {}),
    };
  }

  private buildUrl(path: string, query?: Record<string, string | number | undefined>): string {
    const safePath = path.startsWith("/") || path.startsWith("http") ? path : `/${path}`;
    const url = this.baseUrl
      ? new URL(safePath, ensureTrailingSlash(this.baseUrl))
      : new URL(safePath, "http://asa.local/");
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value === undefined || value === null || value === "") continue;
        if (typeof value === "number" && isNaN(value)) continue;
        url.searchParams.set(key, String(value));
      }
    }
    return this.baseUrl ? url.toString() : url.pathname + url.search;
  }

  private async parseError(response: Response): Promise<ApiError> {
    let body: unknown = undefined;
    let parsed: { code?: string; state?: string } = {};
    try {
      body = await response.json();
      if (body && typeof body === "object") {
        parsed = body as { code?: string; state?: string };
      }
    } catch {
      // not JSON
    }
    return {
      status: response.status,
      code: parsed.code ?? `HTTP_${response.status}`,
      state: parsed.state,
      message: deriveMessage(response.status, parsed.code, parsed.state),
      body,
    };
  }

  async get<T>(path: string, query?: Record<string, string | number | undefined>): Promise<T> {
    const response = await this.fetchImpl(this.buildUrl(path, query), {
      method: "GET",
      headers: this.buildHeaders(),
    });
    if (!response.ok) {
      throw await this.parseError(response);
    }
    return (await response.json()) as T;
  }

  async postForm<T>(path: string, form: FormData): Promise<T> {
    const headers = this.buildHeaders();
    delete (headers as Record<string, string | undefined>)["Content-Type"];
    const response = await this.fetchImpl(this.buildUrl(path), {
      method: "POST",
      headers,
      body: form,
    });
    if (!response.ok) {
      throw await this.parseError(response);
    }
    return (await response.json()) as T;
  }

  /**
   * Fetches a binary / streamed response as a Blob. Used by the dev-only
   * /content download route where the API needs the dev-bypass headers
   * (the browser cannot use the SAS URL when Azurite is bound to its
   * internal Docker DNS name).
   */
  async getBlob(path: string): Promise<Blob> {
    const response = await this.fetchImpl(this.buildUrl(path), {
      method: "GET",
      headers: this.buildHeaders(),
    });
    if (!response.ok) {
      throw await this.parseError(response);
    }
    return await response.blob();
  }
}

function normalizeBaseUrl(value: string | undefined | null): string {
  if (value === undefined || value === null) return "";
  const trimmed = value.trim().replace(/\/+$/, "");
  if (trimmed === "") return "";
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new TypeError(
      `Invalid API base URL: ${JSON.stringify(value)}. Provide an absolute http(s) URL, or leave it empty to use the Vite /api/* proxy.`
    );
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new TypeError(
      `Invalid API base URL protocol: ${parsed.protocol}. Only http and https are supported.`
    );
  }
  return parsed.toString().replace(/\/+$/, "");
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

function deriveMessage(status: number, code?: string, state?: string): string {
  if (code === "SUBSCRIPTION_EXPIRED") {
    return "انتهت صلاحية اشتراك المدرسة. يرجى تجديد الاشتراك للوصول إلى الأرشيف.";
  }
  if (code === "SUBSCRIPTION_SUSPENDED") {
    return "تم تعليق اشتراك المدرسة. يرجى التواصل مع إدارة المدرسة لإعادة التفعيل.";
  }
  if (status === 401) {
    return "انتهت الجلسة. يرجى تسجيل الدخول مرة أخرى.";
  }
  if (status === 402) {
    return state ? `الحساب في حالة ${state}.` : "الدفع مطلوب لمتابعة العملية.";
  }
  if (status === 403) {
    return "ليست لديك صلاحية لتنفيذ هذه العملية.";
  }
  if (status === 404) {
    return "العنصر المطلوب غير موجود.";
  }
  if (status === 429) {
    return "تم تجاوز الحد المسموح من الطلبات. يرجى المحاولة بعد لحظات.";
  }
  if (status >= 500) {
    return "حدث خطأ في الخادم. يرجى المحاولة لاحقاً.";
  }
  return code ?? `HTTP ${status}`;
}
