import axios, { type Method } from "axios";
import { log } from "../index";

const FLASK_BUS_URL = process.env.FLASK_BUS_URL || "http://localhost:8000";

export async function proxyToFlask(
  method: string,
  path: string,
  body: unknown | null,
  tenantId: string
): Promise<{ status: number; data: unknown }> {
  const url = `${FLASK_BUS_URL}${path}`;

  try {
    const response = await axios({
      method: method as Method,
      url,
      data: body || undefined,
      headers: {
        "Content-Type": "application/json",
        "X-Tenant-ID": tenantId,
        "X-Blueprint-Version": "v1.2",
        "X-Source-Service": "ndr-dashboard",
      },
      timeout: 30000,
      validateStatus: () => true,
    });

    if (response.status >= 400) {
      log(`Flask proxy error: ${method} ${path} → ${response.status} (tenant: ${tenantId})`, "tenantProxy");
    }

    return { status: response.status, data: response.data };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    log(`Flask proxy connection error: ${method} ${path} → ${message} (tenant: ${tenantId})`, "tenantProxy");
    return { status: 502, data: { error: "Flask Bus unreachable", detail: message } };
  }
}
