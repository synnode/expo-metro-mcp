import { metroClient } from "../metro-client.js";

export function getStatus(): string {
  const status = {
    connected: metroClient.connected,
    host: metroClient.host,
    port: metroClient.port,
    device: metroClient.deviceTitle,
    buffered_entries: metroClient.bufferedEntries,
    last_connected_at: metroClient.lastConnectedAt?.toISOString() ?? null,
    total_received: metroClient.totalReceived,
    expo_sdk_version: null,
  };

  return JSON.stringify(status, null, 2);
}
