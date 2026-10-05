/** Generic host ↔ app-plugin request envelope. Domain payloads belong to the app. */
export interface PluginRequestV1<TPayload = Record<string, unknown>> {
  version: 1;
  instanceId: string;
  requestId: string;
  method: string;
  payload: TPayload;
}

export interface PluginResponseV1<TResult = unknown> {
  version: 1;
  requestId: string;
  ok: boolean;
  result: TResult | null;
  error: {
    code: string;
    retryable: boolean;
  } | null;
}
