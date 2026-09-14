"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const env_1 = require("./config/env");
const app_1 = require("./app");
const app = (0, app_1.createApp)();
app.listen(env_1.env.PORT, () => {
    console.log(`QRI API listening on http://localhost:${env_1.env.PORT}`);
});
//# sourceMappingURL=index.js.map