import { env } from "./config/env";
import { createApp } from "./app";

const app = createApp();

app.listen(env.PORT, () => {
  console.log(`QRI API listening on http://localhost:${env.PORT}`);
});