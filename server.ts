import { Application } from "oak/mod.ts";
import { config } from "https://deno.land/x/dotenv/mod.ts";
import router from "./routes/index.ts";

const env = config();
const app = new Application();

app.use(router.routes());
app.use(router.allowedMethods());

console.log(`Server running on http://localhost:8000`);

await app.listen({ port: 8000 });
