import path from "node:path";

import { clerkSetup } from "@clerk/testing/playwright";
import { config } from "dotenv";

export default async function globalSetup() {
  config({ path: path.resolve(__dirname, "../.env.local") });
  config({ path: path.resolve(__dirname, "../.env.test.local") });
  if (process.env.CLERK_SECRET_KEY) {
    await clerkSetup();
  }
}
