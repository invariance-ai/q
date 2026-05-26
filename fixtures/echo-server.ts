/**
 * Tiny local HTTP echo server for manually testing registered tools.
 *
 *   pnpm tsx fixtures/echo-server.ts            # listens on :8787
 *   q tools add --name echo --url 'http://localhost:8787/echo' \
 *     --method POST --desc "echoes the request body"
 *   q tools test echo --input msg=hi
 *
 * It replies with a JSON object echoing the method, path, query, headers
 * (Authorization redacted), and body so you can see exactly what `q` sent.
 */
import { createServer } from "node:http";

const PORT = Number(process.env["PORT"] ?? 8787);

const server = createServer((req, res) => {
  const chunks: Buffer[] = [];
  req.on("data", (c) => chunks.push(c as Buffer));
  req.on("end", () => {
    const body = Buffer.concat(chunks).toString("utf8");
    const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
    const headers = { ...req.headers };
    if (headers.authorization) headers.authorization = "***redacted***";
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify(
        {
          method: req.method,
          path: url.pathname,
          query: Object.fromEntries(url.searchParams),
          headers,
          body: body || null,
        },
        null,
        2,
      ),
    );
  });
});

server.listen(PORT, () => {
  process.stdout.write(`echo-server listening on http://localhost:${PORT}\n`);
});
