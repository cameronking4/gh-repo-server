export {  Router } from "https://deno.land/x/oak@v10.0.0/mod.ts";
import { processRoute } from "./process.ts";
import { queueRoute } from "./queue.ts";

const router = new Router();

router.get("/api/train/process", processRoute);
router.post("/api/train/queue", queueRoute);

export default router;
