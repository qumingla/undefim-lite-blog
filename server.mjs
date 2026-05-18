import { createServer } from "node:http";
import { handleRequest } from "./src/app.mjs";
import { ensureStorageFiles } from "./src/store.mjs";

const port = Number(process.env.PORT || 4321);
const host = process.env.HOST || "127.0.0.1";

ensureStorageFiles();

const server = createServer((request, response) => {
  handleRequest(request, response).catch((error) => {
    console.error(error);
    response.statusCode = 500;
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    response.end("<h1>500</h1><p>Server error.</p>");
  });
});

server.listen(port, host, () => {
  console.log(`Undefi Lite Blog is running at http://${host}:${port}`);
});
