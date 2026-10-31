import { serve } from "./serve.mjs";
const port = Number(process.env.PORT ?? 4173);
serve().listen(port, "0.0.0.0", () =>
  console.log(`Preview: http://localhost:${port}/preview/`),
);
