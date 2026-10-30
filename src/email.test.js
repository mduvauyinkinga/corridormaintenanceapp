import { sendTestEmail } from "./email.js";

sendTestEmail("your-email@example.com")
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });