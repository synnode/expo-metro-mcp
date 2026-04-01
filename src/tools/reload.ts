import http from "http";

const METRO_PORT = parseInt(process.env.METRO_PORT ?? "8081", 10);
const METRO_HOST = process.env.METRO_HOST ?? "localhost";

export async function reload(): Promise<string> {
  return new Promise((resolve) => {
    const req = http.request(
      { hostname: METRO_HOST, port: METRO_PORT, path: "/reload", method: "POST" },
      (res) => {
        res.resume();
        if (res.statusCode === 200) {
          resolve("App reloaded.");
        } else {
          resolve(`Reload failed: HTTP ${res.statusCode}`);
        }
      }
    );
    req.on("error", (e) => resolve(`Reload failed: ${e.message}`));
    req.setTimeout(3000, () => { req.destroy(); resolve("Reload failed: timeout"); });
    req.end();
  });
}
